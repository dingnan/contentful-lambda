import https from "https";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// ─── Config (set these in Lambda environment variables) ───────────────────────
const CONTENTFUL_SPACE_ID = process.env.CONTENTFUL_SPACE_ID;
const CONTENTFUL_ENVIRONMENT = process.env.CONTENTFUL_ENVIRONMENT || "master";
const CONTENTFUL_ACCESS_TOKEN = process.env.CONTENTFUL_ACCESS_TOKEN; // Delivery API token

// ─── Helper: HTTPS GET → JSON ─────────────────────────────────────────────────
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(body));
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          }
        });
      })
      .on("error", reject);
  });
}

// ─── Fetch entry with ALL links resolved (include=10 = max depth) ─────────────
async function fetchEntryWithReferences(entryId) {
  const url =
    `https://cdn.contentful.com/spaces/${CONTENTFUL_SPACE_ID}` +
    `/environments/${CONTENTFUL_ENVIRONMENT}` +
    `/entries?sys.id=${entryId}` +
    `&include=10` + // resolve up to 10 levels of linked entries/assets
    `&access_token=${CONTENTFUL_ACCESS_TOKEN}`;

  const response = await httpsGet(url);

  if (!response.items || response.items.length === 0) {
    throw new Error(`Entry not found: ${entryId}`);
  }

  // Build lookup maps from the `includes` block
  const entryMap = {};
  const assetMap = {};

  (response.includes?.Entry || []).forEach((e) => {
    entryMap[e.sys.id] = e;
  });
  (response.includes?.Asset || []).forEach((a) => {
    assetMap[a.sys.id] = a;
  });

  // Recursively resolve all links in a value
  function resolveValue(value, depth = 0) {
    if (depth > 10) return value; // guard against circular refs

    if (!value || typeof value !== "object") return value;

    // Array → resolve each element
    if (Array.isArray(value)) {
      return value.map((v) => resolveValue(v, depth));
    }

    // Contentful Link object → replace with full entity
    if (value.sys?.type === "Link") {
      const linked =
        value.sys.linkType === "Asset"
          ? assetMap[value.sys.id]
          : entryMap[value.sys.id];

      if (!linked) return value; // unresolved (e.g. unpublished)
      return resolveValue(linked, depth + 1);
    }

    // Plain object → resolve each field recursively
    const resolved = {};
    for (const [k, v] of Object.entries(value)) {
      resolved[k] = resolveValue(v, depth);
    }
    return resolved;
  }

  const rawEntry = response.items[0];
  const resolvedEntry = resolveValue(rawEntry);

  return {
    raw: rawEntry, // original entry (links un-resolved)
    resolved: resolvedEntry, // fully resolved entry
    includes: {
      entries: Object.values(entryMap),
      assets: Object.values(assetMap),
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

// ─── Lambda Handler ────────────────────────────────────────────────────────────
export const handler = async (event) => {
  console.log("Lambda 2 received event:", JSON.stringify(event));

  // Accept entryId from direct invocation payload or from a wrapping body string
  const payload =
    typeof event.body === "string" ? JSON.parse(event.body) : event;
  const entryId = payload.entryId;

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
