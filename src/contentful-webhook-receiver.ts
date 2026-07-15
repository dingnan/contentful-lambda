import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const lambda = new LambdaClient({ region: process.env.AWS_REGION });
// handler.js
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!checkSecret(event)) {
      return { statusCode: 401, body: "Unauthorized" };
    }
    // Contentful sends the body as Base64-encoded JSON when routed through Lambda URL
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf-8")
      : event.body || "{}";

    const body = JSON.parse(rawBody);

    const topic = event.headers?.["x-contentful-topic"] || "unknown";
    const webhookName =
      event.headers?.["x-contentful-webhook-name"] || "unknown";
    const eventDatetime = event.headers?.["x-contentful-event-datetime"];
    const idempotencyKey = event.headers?.["x-contentful-idempotency-key"];

    // Space ID lives in the decoded body, not a dedicated header
    const spaceId = body?.sys?.space?.sys?.id || "unknown";

    console.log(`Received Contentful webhook: ${topic}`);
    console.log(
      `Webhook name: ${webhookName}, Space: ${spaceId}, Event time: ${eventDatetime}`,
    );
    console.log("Payload:", JSON.stringify(body, null, 2));

    const contentType = body?.sys?.contentType?.sys?.id;
    const entryId = body?.sys?.id;
    const fields = body?.fields;

    switch (topic) {
      case "ContentManagement.Entry.publish": {
        console.log(`Entry published: ${entryId} (${contentType})`);

        // Access locale-specific fields — sample data uses 'en-US'
        const internalName = fields?.internalName?.["en-US"];
        const cardName = fields?.cardName?.["en-US"];
        console.log(`Card: ${cardName} (internal: ${internalName})`);

        // Invoke 2nd Lambda asynchronously (fire and forget)
        await lambda.send(
          new InvokeCommand({
            FunctionName: "contentful-entry-fetcher", // name or full ARN
            InvocationType: "Event", // "Event" = async, "RequestResponse" = wait for result
            Payload: JSON.stringify({
              entryId,
              topic,
              fields,
            }),
          }),
        );

        console.log("S3 Lambda triggered");
        break;
      }

      case "ContentManagement.Entry.unpublish":
        console.log(`Entry unpublished: ${entryId}`);
        break;

      case "ContentManagement.Entry.delete":
        console.log(`Entry deleted: ${entryId}`);
        break;

      default:
        console.log(`Unhandled topic: ${topic}`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Webhook received", entryId, topic }),
    };
  } catch (err) {
    console.error("Error processing webhook:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};

/**
 * Validates that the webhook event originates from the expected Contentful space and environment.
 * @param {Object} event - The webhook event object containing space and environment information
 * @returns {boolean} True if the event's space ID and environment match the configured values, false otherwise
 */
function checkSecret(event) {
  const crn = event?.headers?.["x-contentful-crn"];
  if (!crn || typeof crn !== "string") return false;
  const spaceId = process.env.CONTENTFUL_SPACE_ID;
  const environment = process.env.CONTENTFUL_ENVIRONMENT;
  const spaceIdFromEvent = getSpaceIdFromCrn(crn);
  const environmentFromEvent = getEnvironmentFromCrn(crn);
  return spaceIdFromEvent === spaceId && environmentFromEvent === environment;
}

function getSpaceIdFromCrn(crn) {
  if (!crn || typeof crn !== "string") return null;
  const match = crn.match(/spaces\/([^/]+)/);
  return match ? match[1] : null;
}

function getEnvironmentFromCrn(crn) {
  if (!crn || typeof crn !== "string") return null;
  const match = crn.match(/environments\/([^/]+)/);
  return match ? match[1] : null;
}