import { createClient } from "contentful";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const CONTENTFUL_SPACE_ID = process.env.CONTENTFUL_SPACE_ID;
const CONTENTFUL_ENVIRONMENT = process.env.CONTENTFUL_ENVIRONMENT || "master";
const CONTENTFUL_ACCESS_TOKEN = process.env.CONTENTFUL_ACCESS_TOKEN;

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

async function fetchEntryWithReferences(entryId) {
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

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log("Lambda 2 received event:", JSON.stringify(event));

  const payload =
    typeof event?.body === "string" && event.body.length > 0
      ? JSON.parse(event.body)
      : event;
  const entryId = payload?.entryId;

  if (!entryId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing required field: entryId" }),
    };
  }

  try {
    const data = await fetchEntryWithReferences(entryId);

    console.log(
      `Resolved entry ${entryId} — ` +
        `${data.includes.entries.length} linked entries, ` +
        `${data.includes.assets.length} assets`,
    );

    await saveToS3(`contentful/${entryId}.json`, data);

    return {
      statusCode: 200,
      body: JSON.stringify(data),
    };
  } catch (err) {
    console.error("Error fetching Contentful entry:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
