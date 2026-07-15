# Angular + Contentful + AWS Lambda + Akamai CMS

## Architecture Overview

```
Contentful CMS
    │
    │ (webhook on publish/update)
    ▼
AWS API Gateway
    │
    ▼
AWS Lambda (Node.js)
    │  1. Fetch latest content from Contentful API
    │  2. Transform content
    │  3. Push JSON to Akamai NetStorage (CMS folder)
    ▼
Akamai NetStorage
    │
    ▼
Angular App (fetches static JSON from Akamai CDN)
```

## Project Structure

```
project/
├── angular-app/          # Angular frontend
├── lambda/               # AWS Lambda function
├── contentful-webhook/   # Contentful webhook config
└── akamai-config/        # Akamai NetStorage config
```

## Setup Instructions

### 1. Contentful Setup

- Create a Contentful space and note your `Space ID` and `Content Delivery API key`
- Define a content type (e.g., `article`) with fields: `title`, `body`, `slug`
- Set up a webhook pointing to your API Gateway URL (see `contentful-webhook/`)

### 2. AWS Lambda Setup

```bash
cd lambda
npm install
zip -r function.zip .
aws lambda create-function \
  --function-name contentful-to-akamai \
  --runtime nodejs18.x \
  --role arn:aws:iam::YOUR_ACCOUNT:role/lambda-role \
  --handler index.handler \
  --zip-file fileb://function.zip
```

### 3. Environment Variables for Lambda

Set these in AWS Lambda console or via CLI:

```
CONTENTFUL_SPACE_ID=your_space_id
CONTENTFUL_ACCESS_TOKEN=your_cda_token
CONTENTFUL_WEBHOOK_SECRET=your_webhook_secret
AKAMAI_HOST=your-netstorage-host.akamai.com
AKAMAI_CPCODE=123456
AKAMAI_KEY_NAME=your-key-name
AKAMAI_KEY=your-akamai-key
AKAMAI_CMS_FOLDER=/123456/cms/content
```

### 4. Angular Setup

```bash
cd angular-app
npm install
# Update src/environments/environment.ts with your Akamai CDN URL
ng serve
```

    https://webhook.site/afdc547b-aad7-429a-8e48-38c2f72f9194

Host 50.16.105.152  http/1.1 Whois Shodan Netify Censys VirusTotal
Location 🇺🇸 Ashburn, Virginia, United States of America
Date 06/22/2026 2:42:24 PM (a few seconds ago)
Size 932 bytes
Time 0.001 sec
ID 9d4bc7b3-7131-4d88-9d3e-9054b2427496
Note Add Note
content-length 932
host webhook.site
x-contentful-idempotency-key 94516f9a3fe42e3065ad9ef4f2a9f865c9bf0a962db8b7cfcb470b42052ea22c
x-contentful-crn crn:contentful:::content:spaces/bkz6hygz9igz/environments/master/entries/4o19ghFQzzNX9uiJifi7Hf
content-type application/vnd.contentful.management.v1+json
x-contentful-event-datetime 2026-06-22T18:42:22.587Z
x-contentful-webhook-request-attempt 1
x-contentful-webhook-name aws lambda
x-contentful-topic ContentManagement.Entry.publish
x-message-key foobar
{
"metadata": {
"tags": [],
"concepts": []
},
"fields": {
"internalName": {
"en-US": "bmo-ascend-world-elite-mastercard"
},
"cardName": {
"en-US": "BMO cash back credit card world elite 2"
},
"cardImage": {
"en-US": {
"sys": {
"type": "Link",
"linkType": "Asset",
"id": "5zjx3VGcI1qdQpFASzJaD1"
}
}
},
"promotionOffer": {
"en-US": {
"sys": {
"type": "Link",
"linkType": "Entry",
"id": "5X17PwLpl3ldq7FMx8y2Mz"
}
}
}
},
"sys": {
"type": "Entry",
"id": "4o19ghFQzzNX9uiJifi7Hf",
"space": {
"sys": {
"type": "Link",
"linkType": "Space",
"id": "bkz6hygz9igz"
}
},
"environment": {
"sys": {
"id": "master",
"type": "Link",
"linkType": "Environment"
}
},
"contentType": {
"sys": {
"type": "Link",
"linkType": "ContentType",
"id": "creditCard"
}
},
"createdBy": {
"sys": {
"type": "Link",
"linkType": "User",
"id": "032Pn45zfLipbTMA55Wmgq"
}
},
"updatedBy": {
"sys": {
"type": "Link",
"linkType": "User",
"id": "032Pn45zfLipbTMA55Wmgq"
}
},
"revision": 35,
"createdAt": "2026-03-27T23:58:39.720Z",
"updatedAt": "2026-06-22T18:42:22.354Z",
"publishedVersion": 75
}
}
