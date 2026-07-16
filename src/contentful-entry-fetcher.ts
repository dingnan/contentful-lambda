import { createClient } from "contentful";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const CONTENTFUL_SPACE_ID = process.env.CONTENTFUL_SPACE_ID;
const CONTENTFUL_ENVIRONMENT = process.env.CONTENTFUL_ENVIRONMENT || "master";
const CONTENTFUL_ACCESS_TOKEN = process.env.CONTENTFUL_ACCESS_TOKEN;

const CONTENT_TYPE = {
  CREDIT_CARD: "creditCard",
  OFFER: "creditCardPromotionOffer",
  CUSTOMER_TYPE: "customerType",
} as const;

function getContentfulClient() {
  if (!CONTENTFUL_SPACE_ID || !CONTENTFUL_ACCESS_TOKEN) {
    throw new Error(
      "Missing Contentful configuration: CONTENTFUL_SPACE_ID and CONTENTFUL_ACCESS_TOKEN are required",
    );
  }

  return createClient({
    space: CONTENTFUL_SPACE_ID,
    environment: CONTENTFUL_ENVIRONMENT,
    accessToken: CONTENTFUL_ACCESS_TOKEN,
  });
}

async function fetchEntryWithReferences(entryId: string): Promise<any> {
  const client = getContentfulClient();
  const response = await client.getEntries({
    "sys.id": entryId,
    include: 10,
  });

  const rawEntry = response.items?.[0];
  if (!rawEntry) {
    throw new Error(`Entry not found: ${entryId}`);
  }

  return {
    raw: rawEntry,
    resolved: rawEntry,
    includes: {
      entries: response.includes?.Entry || [],
      assets: response.includes?.Asset || [],
    },
  };
}

function saveToS3(key, data) {
  const s3 = new S3Client({ region: process.env.AWS_REGION });
  return s3.send(
    new PutObjectCommand({
      Bucket: "contentful-data-cc",
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: "application/json",
    }),
  );
}

// fetches entries that link to a given entry id — one hop up
async function fetchIncomingLinks(entryId: string): Promise<any[]> {
  const client = getContentfulClient();

  try {
    const response = await client.getEntries({
      links_to_entry: entryId,
      include: 10,
      select: ["sys.id", "sys.contentType"],
    });

    if (!response || !Array.isArray(response.items)) {
      throw new Error(`Incoming links lookup failed for ${entryId}: invalid response`);
    }

    return response.items ?? [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Incoming links lookup failed for ${entryId}: ${message}`);
  }
}

async function resolveParentEntries(
  entryId: string,
  contentTypeId: string
): Promise<string[]> {
  if (contentTypeId === CONTENT_TYPE.CREDIT_CARD) {
    // already the top — nothing to resolve
    return [entryId];
  }

  if (contentTypeId === CONTENT_TYPE.OFFER) {
    // one hop: Offer -> Credit Card
    const creditCards = await fetchIncomingLinks(entryId);
    return creditCards.map((entry) => entry.sys.id);
  }

  if (contentTypeId === CONTENT_TYPE.CUSTOMER_TYPE) {
    // two hops: Customer Type -> Offer -> Credit Card
    const offers = await fetchIncomingLinks(entryId);
    const creditCardIdSets = await Promise.all(
      offers.map((offer) => fetchIncomingLinks(offer.sys.id))
    );
    const creditCardIds = creditCardIdSets
      .flat()
      .map((entry) => entry.sys.id);

    // dedupe — same Credit Card could link to multiple Offers under the same Customer Type
    return [...new Set(creditCardIds)];
  }

  throw new Error(`Unhandled content type in resolveParentEntries: ${contentTypeId}`);
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log("Lambda 2 received event:", JSON.stringify(event));

  const payload =
    typeof event?.body === "string" && event.body.length > 0
      ? JSON.parse(event.body)
      : event;
  const entryId = payload?.entryId;
  const contentType = payload?.contentType;

  if (!entryId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing required field: entryId" }),
    };
  }

  try {
    const creditCardEntryIds = await resolveParentEntries(entryId, contentType);
    for (const creditCardEntryId of creditCardEntryIds) {
      const data = await fetchEntryWithReferences(creditCardEntryId);

      console.log(
        `Fetched entry ${creditCardEntryId} — ${contentType}`,
      );

      await saveToS3(`contentful/${creditCardEntryId}.json`, data);
    }

    return {
      statusCode: 200,
      body: '{"message": "Contentful entry fetched and saved to S3", "entryId": "' + entryId + '", "contentType": "' + contentType + '"}',
    };
  } catch (err) {
    console.error("Error fetching Contentful entry:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
