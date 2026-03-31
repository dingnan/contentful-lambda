/**
 * Akamai NetStorage client
 * Uses Akamai NetStorage HTTP API with HMAC-SHA256 authentication
 * Docs: https://techdocs.akamai.com/netstorage/docs/http-api
 */

const https = require('https');
const crypto = require('crypto');

const HOST = process.env.AKAMAI_HOST;           // e.g. your-cpcode.upload.akamai.com
const CP_CODE = process.env.AKAMAI_CPCODE;      // e.g. 123456
const KEY_NAME = process.env.AKAMAI_KEY_NAME;   // NetStorage upload account key name
const KEY = process.env.AKAMAI_KEY;             // NetStorage upload account key
const CMS_FOLDER = process.env.AKAMAI_CMS_FOLDER || `/${CP_CODE}/cms/content`;

/**
 * Upload a file to Akamai NetStorage
 * @param {string} fileName - e.g. 'article.json'
 * @param {string} content  - file content as string
 */
async function uploadFile(fileName, content) {
  const remotePath = `${CMS_FOLDER}/${fileName}`;
  const buffer = Buffer.from(content, 'utf-8');

  const headers = buildAuthHeaders('upload', remotePath, buffer);
  headers['Content-Length'] = buffer.length;
  headers['Content-Type'] = 'application/json';

  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOST,
      path: remotePath,
      method: 'PUT',
      headers,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ statusCode: res.statusCode, body: data });
        } else {
          reject(new Error(`Akamai upload failed ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
}

/**
 * Delete a file from Akamai NetStorage
 */
async function deleteFile(fileName) {
  const remotePath = `${CMS_FOLDER}/${fileName}`;
  const headers = buildAuthHeaders('delete', remotePath);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOST,
      path: remotePath,
      method: 'PUT', // NetStorage uses PUT with action header for delete
      headers,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode }));
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * Build Akamai NetStorage authentication headers
 * https://techdocs.akamai.com/netstorage/docs/http-api#authentication
 */
function buildAuthHeaders(action, path, buffer) {
  const timestamp = Math.floor(Date.now() / 1000);
  const uniqueId = crypto.randomBytes(8).toString('hex');

  // Auth-Data header
  const authData = `5, 0.0.0.0, 0.0.0.0, ${timestamp}, ${uniqueId}, ${KEY_NAME}`;

  // Build sign string
  const actionHeader = buildActionHeader(action, buffer);
  const signString = `x-akamai-acs-action:${actionHeader}\n${authData}\n${path}\n`;

  // HMAC-SHA256 sign
  const hmac = crypto.createHmac('sha256', KEY);
  hmac.update(signString);
  const authSign = hmac.digest('base64');

  return {
    'X-Akamai-ACS-Action': actionHeader,
    'X-Akamai-ACS-Auth-Data': authData,
    'X-Akamai-ACS-Auth-Sign': authSign,
  };
}

function buildActionHeader(action, buffer) {
  switch (action) {
    case 'upload':
      const md5 = buffer
        ? crypto.createHash('md5').update(buffer).digest('hex')
        : '';
      return `version=1&action=upload&upload-type=binary&md5=${md5}`;
    case 'delete':
      return `version=1&action=delete`;
    case 'dir':
      return `version=1&action=dir&format=xml`;
    default:
      return `version=1&action=${action}`;
  }
}


module.exports = { uploadFile, deleteFile };
