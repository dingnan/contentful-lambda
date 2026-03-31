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
