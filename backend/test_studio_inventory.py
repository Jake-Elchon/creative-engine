"""Exercise the owner query against an explicitly selected loopback database."""

import json
import os
import secrets
import unittest
from uuid import uuid4

import psycopg
from dotenv import dotenv_values
from fastapi import Request
from psycopg.conninfo import conninfo_to_dict
from psycopg.rows import dict_row

from .api_support import ApiError
from .storefronts import cursor_for
from .studio import get_studio_inventory


@unittest.skipUnless(os.getenv("CIMFEST_TEST_LOCAL_DB") == "1", "enable explicitly for local integration testing")
class StudioInventoryTests(unittest.TestCase):
    def test_ownership_exact_lookup_pagination_and_empty_storefront(self):
        database_url = os.getenv("DATABASE_URL") or dotenv_values(".env")["DATABASE_URL"]
        config = conninfo_to_dict(database_url)
        self.assertIn(config.get("host"), {"localhost", "127.0.0.1", "::1"})
        self.assertNotIn(",", config.get("hostaddr", ""))
        if config.get("hostaddr"):
            self.assertIn(config["hostaddr"], {"127.0.0.1", "::1"})

        with psycopg.connect(database_url, row_factory=dict_row) as db:
            try:
                self.exercise_inventory(db)
            finally:
                db.rollback()

    def exercise_inventory(self, db):
        creator, visitor = uuid4(), uuid4()
        store, empty_store = uuid4(), uuid4()
        products = sorted([uuid4(), uuid4()])
        for person in (creator, visitor):
            db.execute(
                "insert into cimfest.users (id, email, full_name, local_otp_phone) values (%s, %s, %s, %s)",
                (person, f"{person}@example.test", "Studio integration fixture", f"+237000{secrets.randbelow(1000000):06}"),
            )
        for owner, storefront in ((creator, store), (visitor, empty_store)):
            db.execute(
                "insert into cimfest.storefronts (id, creator_id, handle, display_name) values (%s,%s,%s,%s)",
                (storefront, owner, f"owner-test-{storefront.hex[:12]}", "Studio integration fixture"),
            )
        for product in products:
            db.execute(
                "insert into cimfest.products (id, storefront_id, type_id) "
                "select %s, %s, id from cimfest.product_types where type='tip'",
                (product, store),
            )
        db.execute(
            "insert into cimfest.product_prices (product_id, currency_code, amount_minor) values (%s, 'XAF', 1200)",
            (products[0],),
        )

        request = Request({"type": "http"})
        request.state.request_id = "inventory-test"

        def data(owner, **query):
            params = {"cursor": None, "limit": 1, "productId": None, **query}
            response = get_studio_inventory(request, user={"id": owner}, db=db, **params)
            self.assertEqual("no-store", response.headers["cache-control"])
            return json.loads(response.body)["data"]

        first = data(creator)
        self.assertEqual([str(store)], [s["storefrontId"] for s in first["storefronts"]])
        self.assertEqual([str(products[0])], [p["productId"] for p in first["products"]])
        self.assertEqual(1200, first["products"][0]["prices"][0]["amountMinor"])
        self.assertEqual(cursor_for(products[0]), first["nextCursor"])
        last = data(creator, cursor=first["nextCursor"])
        self.assertEqual([str(products[1])], [p["productId"] for p in last["products"]])
        self.assertIsNone(last["nextCursor"])
        exact = data(creator, productId=products[1])
        self.assertEqual(last["products"], exact["products"])
        visitor_result = data(visitor, cursor=first["nextCursor"])
        self.assertEqual([], visitor_result["products"])
        self.assertEqual([str(empty_store)], [s["storefrontId"] for s in visitor_result["storefronts"]])
        with self.assertRaises(ApiError) as rejected:
            data(visitor, productId=products[0])
        self.assertEqual((404, "PRODUCT_NOT_FOUND"), (rejected.exception.status, rejected.exception.code))
        with self.assertRaises(ApiError) as invalid:
            data(creator, productId=products[0], cursor=first["nextCursor"])
        self.assertEqual((400, "INVALID_QUERY"), (invalid.exception.status, invalid.exception.code))
