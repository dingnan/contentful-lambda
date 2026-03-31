# Akamai NetStorage Configuration

## Required: NetStorage Upload Account Setup

1. Log into **Akamai Control Center** → **NetStorage**
2. Create or select a **Storage Group**
3. Note your **CP Code** (e.g. `123456`)
4. Create an **Upload Account**:
   - Key Name: `contentful-sync`
   - Permissions: `upload`, `overwrite`, `delete`
5. Generate and save the **Key**

---

## Directory Structure in NetStorage

```
/123456/
└── cms/
    └── content/
        ├── article.json       ← synced by Lambda
        ├── hero.json          ← synced by Lambda
        └── navigation.json    ← synced by Lambda
```

---

## Akamai CDN Configuration (Property Manager)

Create an Akamai property to serve the NetStorage content:

```
Origin Type: NetStorage
Origin Path: /123456/cms/content
```

### Caching Rules (suggested)

| Path Pattern | Cache TTL | Notes |
|---|---|---|
| `*.json` | 5 minutes | Content JSON files |
| `/cms/content/*` | 5 minutes | All CMS content |

### CORS Headers Rule

Add a rule for `/cms/content/*` with response headers:
```
Access-Control-Allow-Origin: https://your-angular-app.com
Access-Control-Allow-Methods: GET
Cache-Control: public, max-age=300
```

---

## Environment Variables Summary

```bash
# Lambda environment variables
AKAMAI_HOST=your-cpcode.upload.akamai.com
AKAMAI_CPCODE=123456
AKAMAI_KEY_NAME=contentful-sync
AKAMAI_KEY=your-upload-account-key
AKAMAI_CMS_FOLDER=/123456/cms/content

# Angular environment (CDN delivery hostname, different from upload hostname)
AKAMAI_CDN_BASE_URL=https://your-delivery-hostname.akamai.com/123456/cms/content
```

> ⚠️ Note: The **upload hostname** (used by Lambda) is different from the **CDN delivery hostname** (used by Angular).
> - Upload: `<cpcode>.upload.akamai.com`
> - Delivery: configured in your Akamai property (e.g. `assets.yourcompany.com`)
