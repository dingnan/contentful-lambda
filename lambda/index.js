/**
 * AWS Lambda: Contentful Webhook → Akamai NetStorage
 *
 * Triggered by: Contentful webhook via API Gateway
 * Action: Fetches latest content from Contentful, stores JSON in Akamai NetStorage
 */

const contentfulClient = require('./contentful-client');
const akamaiClient = require('./akamai-client');
const crypto = require('crypto');

exports.handler = async (event) => {
  console.log('Lambda triggered:', JSON.stringify(event, null, 2));

  try {
    // 1. Validate Contentful webhook secret
    const isValid = validateWebhookSecret(event);
    if (!isValid) {
      return response(401, { error: 'Unauthorized: Invalid webhook secret' });
    }

    // 2. Parse webhook payload
    const body = JSON.parse(event.body || '{}');
    const contentType = body.sys?.contentType?.sys?.id;
    const entryId = body.sys?.id;
    const locale = body.sys?.locale || 'en-US';

    console.log(`Processing contentType=${contentType}, entryId=${entryId}`);

    // 3. Fetch all entries of this content type from Contentful
    const entries = await contentfulClient.fetchEntries(contentType, locale);

    // 4. Transform entries to clean JSON
    const transformedContent = transformEntries(entries, contentType);

    // 5. Upload to Akamai NetStorage
    const fileName = `${contentType}.json`;
    await akamaiClient.uploadFile(
      fileName,
      JSON.stringify(transformedContent, null, 2)
    );

    console.log(`Successfully uploaded ${fileName} to Akamai`);

    return response(200, {
      message: 'Content synced successfully',
      contentType,
      entryCount: transformedContent.items.length,
      fileName,
    });

  } catch (err) {
    console.error('Lambda error:', err);
    return response(500, { error: err.message });
  }
};

/**
 * Validate Contentful webhook secret header
 */
function validateWebhookSecret(event) {
  const secret = process.env.CONTENTFUL_WEBHOOK_SECRET;
  if (!secret) return true; // Skip validation if not configured

  const authHeader = event.headers?.['x-contentful-webhook-secret']
    || event.headers?.['X-Contentful-Webhook-Secret'];

  return authHeader === secret;
}

/**
 * Transform Contentful entries into a clean, flat JSON structure
 */
function transformEntries(entries, contentType) {
  const items = entries.items.map((entry) => {
    const fields = {};

    // Flatten locale-wrapped fields
    Object.keys(entry.fields || {}).forEach((key) => {
      const value = entry.fields[key];
      // Contentful CDA returns fields as { 'en-US': 'value' }
      fields[key] = typeof value === 'object' && !Array.isArray(value)
        ? Object.values(value)[0]
        : value;
    });

    return {
      id: entry.sys.id,
      createdAt: entry.sys.createdAt,
      updatedAt: entry.sys.updatedAt,
      ...fields,
    };
  });

  return {
    contentType,
    total: entries.total,
    updatedAt: new Date().toISOString(),
    items,
  };
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
