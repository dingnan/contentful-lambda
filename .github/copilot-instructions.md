# Copilot Instructions for Contentful CMS + Angular + Lambda + Akamai

## Project Overview

This is an **event-driven CMS content delivery system** integrating Contentful (headless CMS), AWS Lambda (webhook processor), Akamai NetStorage (CDN-backed storage), and Angular (static-JSON frontend).

**Total Data Flow**: Contentful webhook → Lambda validates & transforms → Akamai NetStorage upload → Angular fetches from CDN

---

## Architecture & Design Decisions

### Why This Tech Stack?

- **Contentful**: Headless CMS for authors; Content Delivery API for read-only access
- **Lambda webhook trigger**: Sync only on content changes (vs polling); serverless, auto-scale
- **Akamai NetStorage**: Reliable file storage with built-in HMAC-SHA256 auth; CDN-optimized for reads
- **Static JSON on CDN**: Fast delivery, highly cacheable, no backend API complexity at scale
- **Angular Standalone**: Modern, lightweight, great type safety
- **Client-side caching (30s/5min TTL)**: Reduces CDN hits; graceful fallback to stale data on errors

### Content Flow Architecture

```
Contentful CMS
  → Webhook triggers API Gateway POST /webhook/contentful {CONTENT_TYPE}
    → Lambda validates X-Contentful-Webhook-Secret header
      → Fetches all entries for that content type from Contentful CDA
        → Auto-paginates (100 items/request) to handle large datasets
        → Transforms locale-wrapped fields { 'en-US': 'value' } → flat { value }
        → Adds metadata wrapper: { contentType, total, updatedAt, items: [...] }
      → HMAC-SHA256 signs request to Akamai NetStorage
      → PUT /[CPCODE]/cms/content/[contentType].json with MD5 checksum
        → Akamai CDN serves with Cache-Control headers
          → Angular ContentService fetches, caches for 30s (dev) / 5min (prod)
            → Template displays or fallback cached/stale data
```

---

## Project Structure & File Patterns

### Angular App (`angular-app/`)

- **Standalone components** everywhere (`standalone: true` in decorator)
- **No NgModule**; uses Angular 17+ route-based config
- **Service pattern**: `ContentService` provides generic `fetchContent<T>(type)` with TTL caching
- **Models mirror Lambda output**: `ContentModel` extends `ContentWrapper` with `items: T[]`
- **External templates** for larger components (`home/`, `article/`), inline for small ones

#### Key Files:

- [`src/app/services/content.service.ts`](../angular-app/src/app/services/content.service.ts) — In-memory cache with TTL, stale-fallback on errors, generic type support
- [`src/app/models/content.model.ts`](../angular-app/src/app/models/content.model.ts) — Type definitions matching Lambda wrapper structure
- [`src/app/components/article/article.component.ts`](../angular-app/src/app/components/article/article.component.ts) — Route params, lazy loading, error handling example
- [`src/app/components/home/home.component.ts`](../angular-app/src/app/components/home/home.component.ts) — Sorting, refresh with cache invalidation
- [`src/environments/environment*.ts`](../angular-app/src/environments/) — CDN URL per environment

#### Build Commands:

```bash
cd angular-app
npm install                    # Install deps
ng serve                       # Dev server (localhost:4200), live reload
ng test                        # Karma + Jasmine unit tests
ng lint                        # TypeScript linting
npm run build                  # Standard build → dist/
npm run build:prod             # Production with optimizations, hashing, budgets
```

---

### Lambda Function (`lambda/`)

- **Node.js 18.x** runtime, 256MB memory, 30s timeout (per `template.yaml`)
- **Client pattern**: `*-client.js` modules for Contentful & Akamai external calls
- **Webhook validation**: Compares `X-Contentful-Webhook-Secret` header with env var
- **Pagination**: Contentful CDA pagination handled automatically (100 items/request)
- **Transformation**: Flattens locale-wrapped fields; adds metadata wrapper
- **Error handling**: Logs to CloudWatch; fails fast on auth/validation errors
- **Testing**: Jest with mocked clients; test both success and error paths

#### Key Files:

- [`index.js`](../lambda/index.js) — Lambda handler: webhook validation, orchestration, error handling
- [`contentful-client.js`](../lambda/contentful-client.js) — Contentful CDA fetch with auto-pagination, error handling
- [`akamai-client.js`](../lambda/akamai-client.js) — HMAC-SHA256 auth header generation, MD5 checksums, HTTPS upload
- [`index.test.js`](../lambda/index.test.js) — Jest mocks for both clients

#### Build Commands:

```bash
cd lambda
npm install                    # Install deps
npm test                       # Jest unit tests (mocked clients)
npm run build                  # Create function.zip with dependencies
npm run deploy                 # AWS CLI: updates Lambda from function.zip
```

#### Environment Variables (set in AWS Lambda console or SAM):

```
# Contentful
CONTENTFUL_SPACE_ID=abc123...      # Space ID from Contentful
CONTENTFUL_ACCESS_TOKEN=CFPAT_...  # Content Delivery API token (read-only)
CONTENTFUL_WEBHOOK_SECRET=secret123  # Custom header validation (your choice)

# Akamai NetStorage
AKAMAI_HOST=your-cpcode.upload.akamai.com
AKAMAI_CPCODE=123456
AKAMAI_KEY_NAME=your-netstorage-key-name
AKAMAI_KEY=base64_encoded_key
AKAMAI_CMS_FOLDER=/123456/cms/content  # Optional; defaults to /{CPCODE}/cms/content
```

---

### Contentful Webhook (`contentful-webhook/`)

- **Setup**: Contentful Settings → Webhooks → Add Webhook
- **URL**: Points to AWS API Gateway → Lambda
- **Trigger on**: `Entry.publish`, `Entry.unpublish`, `Entry.delete`
- **Custom header**: Add `X-Contentful-Webhook-Secret: {YOUR_SECRET}` (must match Lambda env var)
- **Note**: Webhook payload includes only metadata; Lambda fetches full entries from CDA

---

### Akamai Config (`akamai-config/`)

- **Setup**: NetStorage account with upload key (HMAC-SHA256)
- **CDN Property**: Configure `Cache-Control: public, max-age=300` for `/cms/content/*`
- **CORS**: Add header `Access-Control-Allow-Origin: *` for Angular cross-origin fetches
- **Path structure**: `/{CPCODE}/cms/content/{contentType}.json` (not nested by locale)

---

## Project-Specific Conventions

| Convention                | Pattern                                                                   | Why                                                    |
| ------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Naming**                | `*-client.js` for external services                                       | Clear responsibility separation                        |
| **Locale handling**       | Contentful CDA returns `{ 'en-US': 'value' }`; Lambda flattens to `value` | Simpler Angular templates, smaller JSON                |
| **Content type identity** | Used as both filename and cache key                                       | Predictable paths; easy to invalidate specific content |
| **Metadata wrapper**      | Every response: `{ contentType, total, updatedAt, items: T[] }`           | Consistent structure for all content types             |
| **Component templates**   | Inline for <50 lines, external `.html/.scss` for larger                   | Improves readability and reusability                   |
| **Standalone Angular**    | No NgModule; all components `standalone: true`                            | Modern, lighter bundle; tree-shakeable                 |
| **Service caching**       | In-memory TTL (30s dev, 5min prod) with stale fallback                    | Balances freshness with resilience                     |

---

## Build & Deploy

### Development Workflow

```bash
# Start Angular dev server
cd angular-app && ng serve
# Runs on localhost:4200, watches for changes

# Update environment.ts with local Akamai test URL
# (or mock with environment.mock.ts)

# Run tests locally
ng test
```

### Lambda Deployment

```bash
cd lambda

# Test locally
npm test

# Build and deploy
npm run build
npm run deploy
# Or manually: zip function.zip * && aws lambda update-function-code ...
```

### Production Build

```bash
cd angular-app
npm run build:prod
# Generates optimized dist/ with hashing
# Respects production budget limits (initial 1MB, lazy routes, component styles 4KB)
# Copy to web server or S3 static hosting
```

---

## Common Issues & Solutions

### Lambda Fails with 401 Unauthorized

- **Root cause**: Invalid `CONTENTFUL_WEBHOOK_SECRET` or missing env var
- **Solution**:
  - Verify Lambda env var matches webhook header value exactly
  - Check Contentful webhook custom header: `X-Contentful-Webhook-Secret: {VALUE}`
  - Note: Header names are case-insensitive but values are NOT

### Akamai Upload Fails with 401 Signature Error

- **Root cause**: HMAC-SHA256 signature wrong or MD5 hash mismatch
- **Solution**:
  - Verify `AKAMAI_KEY` is base64-encoded private key
  - Check MD5 calculation in [`akamai-client.js` lines 105–110](../lambda/akamai-client.js#L105-L110)
  - Ensure buffer is passed for `upload` action (needed for MD5)
  - Validate sign string format: `x-akamai-acs-action:{ACTION}\n{AUTH_DATA}\n{PATH}\n`

### Angular Shows Stale or Empty Content

- **Root cause**: Cache TTL mismatch between Angular and Akamai
- **Solution**:
  - Increase `contentCacheMs` in [`src/environments/environment.ts`](../angular-app/src/environments/environment.ts)
  - Verify Akamai CDN returns `Cache-Control: public, max-age=300` header
  - Check browser DevTools Network tab for cache hits
  - Fallback: Manually append `?t={timestamp}` to skip cache

### CORS Errors in Browser Console

- **Root cause**: Akamai CDN missing `Access-Control-Allow-Origin` header
- **Solution**:
  - Log in to Akamai Property Manager
  - Add CORS rule for `/cms/content/*`
  - Set `Access-Control-Allow-Origin: *`
  - Allow credentials if needed

### Pagination Issues with Large Content Sets

- **Root cause**: Contentful CDA paginated at 100 items/request
- **Solution**:
  - Lambda handle auto-pagination via `contentful-client.js`
  - If >10,000 entries, consider batch processing or cursor-based requests
  - Monitor Akamai file size; may need to split by published year or status

### Rich Text Content Not Rendering

- **Root cause**: `@contentful/rich-text-html-renderer` not installed
- **Solution**:
  - `npm install @contentful/rich-text-html-renderer @contentful/rich-text-types`
  - Update article template to use renderer
  - Currently uses simple `{{ article.body }}` for plain text

---

## Testing & Validation

### Unit Tests

```bash
# Lambda tests
cd lambda && npm test

# Angular tests
cd angular-app && ng test
```

### Integration Testing Checklist

- [ ] Publish new content in Contentful → Webhook fires
- [ ] Lambda validates signature, fetches, transforms
- [ ] JSON appears on Akamai: `GET /{CPCODE}/cms/content/article.json`
- [ ] Angular loads content from browser → displays correctly
- [ ] Browser cache shows 304 or TTL-based refresh
- [ ] Delete/unpublish in Contentful → Lambda handles gracefully

### Load Testing

- Monitor Lambda CloudWatch: CPU, duration, error rate
- Monitor Akamai: File size, request count, cache hit ratio
- Test pagination with >100 entries per content type

---

## Security Considerations

1. **Webhook Validation**: Always validate `X-Contentful-Webhook-Secret` header (prevents spoofing)
2. **Content Delivery Token**: Use **read-only** Contentful token (CDA, not CMA)
3. **Akamai Key Rotation**: Regularly rotate `AKAMAI_KEY` and update env vars
4. **CORS**: Limit `Access-Control-Allow-Origin` if possible (e.g., to your domain)
5. **Lambda IAM Role**: Minimal permissions (no unnecessary S3, EC2, etc.)
6. **Environment Secrets**: Never commit env vars; use AWS Secrets Manager or Parameter Store

---

## Performance Tuning

- **Lambda**: Consider increasing memory (→ CPU) for faster Contentful API pagination if >1000 entries
- **Akamai TTL**: Set `max-age=300` (5min) for good balance of freshness + cache hits
- **Angular Cache**:
  - Dev: 30s TTL to catch rapid content updates
  - Prod: 5min TTL to reduce CDN load
- **Gzip**: Enable on Akamai CDN for JSON compression
- **Bundling**: Angular `npm run build:prod` respects budgets; monitor with `npm run analyze`

---

## Useful AWS SAM Commands

```bash
# View Lambda logs (last 10 lines)
aws logs tail /aws/lambda/contentful-to-akamai --follow

# Invoke Lambda manually (test)
aws lambda invoke --function-name contentful-to-akamai \
  --payload '{"contentType": "article"}' \
  response.json
cat response.json

# Update environment variable
aws lambda update-function-configuration \
  --function-name contentful-to-akamai \
  --environment Variables={CONTENTFUL_WEBHOOK_SECRET=newsecret}
```

---

## Quick Tips for Copilot AI Assistance

When asking for help with this project:

- **Angular changes**: Specify component path and whether it's template or logic
- **Lambda changes**: Note if it affects transformation, authentication, or error handling
- **Schema updates**: If adding new content type fields, update TypeScript models and Lambda
- **Caching issues**: Always verify both Angular TTL and Akamai `Cache-Control` headers match intent
- **Type safety**: Models in `content.model.ts` should match Lambda output exactly

---

## Related Files & References

- 📘 [Contentful Content Delivery API Docs](https://www.contentful.com/developers/docs/references/content-delivery-api/)
- 📘 [Akamai NetStorage HTTP API](https://techdocs.akamai.com/netstorage/docs/http-api)
- 📘 [Angular Standalone Components](https://angular.io/guide/standalone-components)
- 📘 [AWS Lambda Environment Variables](https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html)
