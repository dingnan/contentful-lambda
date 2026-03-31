# Contentful Webhook Configuration

## Setup via Contentful Web App

1. Go to **Settings → Webhooks** in your Contentful space
2. Click **Add Webhook**
3. Configure:

```
Name: Sync to Akamai
URL: https://YOUR_API_GATEWAY_URL/prod/webhook/contentful
Method: POST
```

### Headers
| Key | Value |
|-----|-------|
| `Content-Type` | `application/json` |
| `X-Contentful-Webhook-Secret` | `YOUR_WEBHOOK_SECRET` |

### Triggers
Check the following events:
- ✅ Entry → Publish
- ✅ Entry → Unpublish
- ✅ Entry → Delete

### Payload
Leave as default (full payload).

---

## Setup via Contentful Management API

```bash
curl -X POST \
  https://api.contentful.com/spaces/YOUR_SPACE_ID/webhook_definitions \
  -H "Authorization: Bearer YOUR_MANAGEMENT_TOKEN" \
  -H "Content-Type: application/vnd.contentful.management.v1+json" \
  -d '{
    "name": "Sync to Akamai",
    "url": "https://YOUR_API_GATEWAY_URL/prod/webhook/contentful",
    "topics": [
      "Entry.publish",
      "Entry.unpublish",
      "Entry.delete"
    ],
    "headers": [
      {
        "key": "X-Contentful-Webhook-Secret",
        "value": "YOUR_WEBHOOK_SECRET",
        "secret": true
      }
    ],
    "httpBasicUsername": null
  }'
```

---

## Contentful Content Model Example

Create a content type with ID `article`:

```json
{
  "sys": { "id": "article" },
  "name": "Article",
  "fields": [
    { "id": "title",       "name": "Title",       "type": "Symbol",   "required": true },
    { "id": "slug",        "name": "Slug",         "type": "Symbol",   "required": true, "validations": [{"unique": true}] },
    { "id": "body",        "name": "Body",         "type": "RichText", "required": false },
    { "id": "summary",     "name": "Summary",      "type": "Text",     "required": false },
    { "id": "publishDate", "name": "Publish Date", "type": "Date",     "required": false },
    { "id": "image",       "name": "Hero Image",   "type": "Link",     "linkType": "Asset", "required": false }
  ]
}
```

---

## Expected Akamai Output

After a Contentful publish event, the Lambda will create/update:

```
/123456/cms/content/article.json
```

Sample file content:
```json
{
  "contentType": "article",
  "total": 3,
  "updatedAt": "2024-11-15T10:30:00.000Z",
  "items": [
    {
      "id": "abc123",
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-11-15T10:29:00Z",
      "title": "Hello World",
      "slug": "hello-world",
      "summary": "An introduction post",
      "publishDate": "2024-11-15"
    }
  ]
}
```
