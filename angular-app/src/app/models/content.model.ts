/**
 * Matches the JSON structure produced by the Lambda function
 * and stored in Akamai NetStorage
 */

export interface ContentResponse<T> {
  contentType: string;
  total: number;
  updatedAt: string;
  items: T[];
}

export interface Article {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  slug: string;
  summary?: string;
  body?: string;
  publishDate?: string;
  image?: ContentfulAsset;
}

export interface ContentfulAsset {
  sys: { id: string };
  fields?: {
    title: string;
    file: {
      url: string;
      contentType: string;
    };
  };
}

export interface Hero {
  id: string;
  heading: string;
  subheading?: string;
  ctaText?: string;
  ctaLink?: string;
  backgroundImage?: ContentfulAsset;
}
