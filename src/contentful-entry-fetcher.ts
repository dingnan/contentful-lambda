import { createClient } from "contentful";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

const CONTENTFUL_SPACE_ID = process.env.CONTENTFUL_SPACE_ID;
const CONTENTFUL_ENVIRONMENT = process.env.CONTENTFUL_ENVIRONMENT || "master";
const CONTENTFUL_ACCESS_TOKEN = process.env.CONTENTFUL_ACCESS_TOKEN;
const AKAMAI_FOLDER_MAPPING = process.env.AKAMAI_FOLDER_MAPPING;

const CONTENT_TYPE = {
  CREDIT_CARD: "creditCard",
  OFFER: "creditCardPromotionOffer",
  CUSTOMER_TYPE: "customerType",
  HTML: "html",
  JSON: "json",
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
  console.log(`Fetching entry ${entryId} with references from Contentful...`);
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

function saveToS3(key: string, body: string, contentType: string) {
  const s3 = new S3Client({ region: process.env.AWS_REGION });
  console.log(
    `Saving to S3: Bucket=contentful-data-cc, Key=${key}, ContentType=${contentType}`,
  );
  return s3.send(
    new PutObjectCommand({
      Bucket: "contentful-data-cc",
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

function getEntryField(data: any, fieldName: string) {
  const field = data?.raw?.fields?.[fieldName];
  return field?.["en-US"] ?? field;
}

// Validates that the given value is a mapping of deployment targets to cpcodes
function isCpcodeMapping(value: unknown): value is Record<string, number> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (cpcode) =>
        typeof cpcode === "number" && Number.isInteger(cpcode) && cpcode > 0,
    )
  );
}

function getCpcodeFromName(name: unknown): number {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new Error("Missing name for deployment target extraction");
  }

  const segments = name.trim().split("/").filter(Boolean);
  if (segments.length < 2) {
    throw new Error(`Invalid name for deployment target extraction: ${name}`);
  }

  if (!AKAMAI_FOLDER_MAPPING) {
    throw new Error("Missing AKAMAI_FOLDER_MAPPING configuration");
  }

  const mapping: Record<string, number> = JSON.parse(AKAMAI_FOLDER_MAPPING);

  if (!isCpcodeMapping(mapping)) {
    throw new Error("AKAMAI_FOLDER_MAPPING must be a JSON object of cpcodes");
  }

  const deploymentTarget = `USST-${segments[0]}-${segments[1]}`.toUpperCase();
  const cpcode = mapping[deploymentTarget];
  if (cpcode === undefined) {
    throw new Error(
      `No cpcode configured for deployment target: ${deploymentTarget}`,
    );
  }

  return cpcode;
}

function getS3KeyFromDeployPath(data: any) {
  const deployPath = getEntryField(data, "deployPath");
  if (typeof deployPath !== "string" || deployPath.trim().length === 0) {
    throw new Error("Missing deployPath for Contentful asset");
  }

  const key = deployPath.trim().replace(/^\/+/, "");
  // Prevent directory traversal attacks by disallowing ".." in the path
  if (key.split("/").includes("..")) {
    throw new Error("Invalid deployPath for Contentful asset");
  }

  return `contentful/${key}`;
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
      throw new Error(
        `Incoming links lookup failed for ${entryId}: invalid response`,
      );
    }

    return response.items ?? [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Incoming links lookup failed for ${entryId}: ${message}`);
  }
}

async function resolveParentEntries(
  entryId: string,
  contentTypeId: string,
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
      offers.map((offer) => fetchIncomingLinks(offer.sys.id)),
    );
    const creditCardIds = creditCardIdSets.flat().map((entry) => entry.sys.id);

    // dedupe — same Credit Card could link to multiple Offers under the same Customer Type
    return [...new Set(creditCardIds)];
  }

  throw new Error(
    `Unhandled content type in resolveParentEntries: ${contentTypeId}`,
  );
}

function isCreditCardType(contentTypeId: string): boolean {
  return (
    contentTypeId === CONTENT_TYPE.CREDIT_CARD ||
    contentTypeId === CONTENT_TYPE.OFFER ||
    contentTypeId === CONTENT_TYPE.CUSTOMER_TYPE
  );
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
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
    if (isCreditCardType(contentType)) {
      const creditCardEntryIds = await resolveParentEntries(
        entryId,
        contentType,
      );
      for (const creditCardEntryId of creditCardEntryIds) {
        const data = await fetchEntryWithReferences(creditCardEntryId);
        console.log(`Fetched entry ${creditCardEntryId} — ${contentType}`);

        const key = getS3KeyFromDeployPath(data);
        await saveToS3(key, JSON.stringify(data, null, 2), "application/json");
      }
    } else {
      if (
        contentType === CONTENT_TYPE.HTML ||
        contentType === CONTENT_TYPE.JSON
      ) {
        const data = await fetchEntryWithReferences(entryId);
        console.log(`Fetched entry ${entryId} — ${contentType}`);

        const name = getEntryField(data, "name");
        if (typeof name !== "string") {
          throw new Error(
            `Missing name for Contentful entry ${entryId} to extract deployment target`,
          );
        }

        const cpcode = getCpcodeFromName(name);
        console.log(`Extracted cpcode ${cpcode} from name ${name}`);

        const content = getEntryField(data, "content");
        let body: string;
        let mimeType: string;
        if (contentType === CONTENT_TYPE.HTML) {
          if (typeof content !== "string") {
            throw new Error(
              `Missing HTML content for Contentful entry ${entryId}`,
            );
          }
          body = content;
          mimeType = "text/html; charset=utf-8";
        } else {
          if (content === undefined) {
            throw new Error(
              `Missing JSON content for Contentful entry ${entryId}`,
            );
          }
          body =
            typeof content === "string"
              ? JSON.stringify(JSON.parse(content), null, 2)
              : JSON.stringify(content, null, 2);
          mimeType = "application/json";
        }

        await saveToS3(getS3KeyFromDeployPath(data), body, mimeType);
      }
    }

    return {
      statusCode: 200,
      body:
        '{"message": "Contentful entry fetched and saved to S3", "entryId": "' +
        entryId +
        '", "contentType": "' +
        contentType +
        '"}',
    };
  } catch (err) {
    console.error("Error fetching Contentful entry:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
