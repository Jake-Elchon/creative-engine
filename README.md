# creative-engine
A full stack application for a creative commerce web application to enhance the creative prospects of the locals and their diaspora

Set up CIMFEST on your computer
This guide uses Windows PowerShell. You'll run three parts on your computer: the Supabase database, the Python server, and the React website.
1. Get ready
- Install Docker Desktop, Python 3, and Node.js with npm. If the project asks for a specific version, use that version.
- Download or clone the project and open PowerShell in the main project folder. This is the folder that contains backend and .env.example.
- Open Docker Desktop and wait until it is running.
2. Start the database
Run these commands from the main project folder:
& ./.tools/bin/supabase.exe start
& ./.tools/bin/supabase.exe migration up
& ./.tools/bin/supabase.exe status -o env
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
If ./.tools/bin/supabase.exe is missing, install the Supabase command-line tool and use supabase in its place. For example, run supabase start.

Open .env in a text editor. Copy the values from the status output into the matching settings in .env:
Name in the status output	Where the value goes
API_URL	SUPABASE_URL
DB_URL	DATABASE_URL
PUBLISHABLE_KEY	The publishable key setting in .env.example
SECRET_KEY	The secret key setting in .env.example


Keep the setting names from .env.example. Keep .env private and out of Git.
3. Start the Python server
From the main project folder, run:
py -m venv .venv
& ./.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
& ./.venv/Scripts/python.exe -m uvicorn backend.main:app --reload

Leave this PowerShell window open. Check that the server and database connection both respond successfully. You can also open the API testing page or Supabase Studio to view the database.
4. Start the website
Open a second PowerShell window. Go to the folder with the React app's package.json. If that folder contains an example settings file, follow it. If it asks for the Python server URL, use http://127.0.0.1:8000 for the server address.

npm install
npm run dev

Open the local URL that Vite prints in the terminal. Leave both PowerShell windows open while you use the app.

5. Try creating an account
To test sign-up and login on your own computer, add CIMFEST_LOCAL_OTP_ENABLED=true to the main .env file. Restart the Python server with the same command from step 3. Use this setting only for local testing because the server returns the sign-in code in its response.

1. On the API testing page, open POST /api/v1/auth/otp/request and submit a test Cameroonian phone number and email address.
2. Copy the six-digit code from data.code. For a new account, send it with the same phone number, a name, and a language (en or fr) to POST /api/v1/auth/otp/verify.
3. To test login, request a fresh code with the same phone and email, then send the phone and new code to POST /api/v1/auth/login.
The public artist list shows accounts after they create a storefront. On a fresh database, you may need to create a storefront before an artist appears.
Optional setup for payments and invitations
- To test payments, put your Fapshi sandbox credentials in FAPSHI_API_USER and FAPSHI_API_KEY. For callbacks, set the same FAPSHI_WEBHOOK_SECRET in the app and in Fapshi, and give Fapshi an HTTPS address that reaches /api/v1/webhooks/fapshi. On localhost, you can also check payments through the buyer's checkout status route. Use a product priced in XAF at 100 francs or more and add an MTN or Orange payment method to the seller's account.
- For guest checkout links or invitations, set CIMFEST_TOKEN_SECRET to a random secret of at least 32 bytes and keep it the same across restarts. Set CIMFEST_PUBLIC_URL to the website address used for storefront and invitation links. The server queues invitation messages. A separate worker is required to send them.
Stop the app
Press Ctrl+C in both PowerShell windows. From the main project folder, run & ./.tools/bin/supabase.exe stop or supabase stop if you installed the tool separately.
