import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map, shareReplay, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { ContentResponse, Article, Hero } from '../models/content.model';

@Injectable({
  providedIn: 'root',
})
export class ContentService {
  private readonly baseUrl = environment.akamaiCdnBaseUrl;

  // Simple in-memory cache: contentType → { data, expiresAt }
  private cache = new Map<string, { data: any; expiresAt: number }>();

  constructor(private http: HttpClient) {}

  /**
   * Fetch articles from Akamai CDN
   */
  getArticles(): Observable<Article[]> {
    return this.fetchContent<Article>('article').pipe(
      map((res) => res.items)
    );
  }

  /**
   * Fetch a single article by slug
   */
  getArticleBySlug(slug: string): Observable<Article | undefined> {
    return this.getArticles().pipe(
      map((articles) => articles.find((a) => a.slug === slug))
    );
  }

  /**
   * Fetch hero content
   */
  getHeroes(): Observable<Hero[]> {
    return this.fetchContent<Hero>('hero').pipe(
      map((res) => res.items)
    );
  }

  /**
   * Generic method to fetch any content type from Akamai CDN
   * Includes cache-busting and TTL-based in-memory caching
   */
  fetchContent<T>(contentType: string): Observable<ContentResponse<T>> {
    const cacheKey = contentType;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() < cached.expiresAt) {
      return of(cached.data);
    }

    const url = `${this.baseUrl}/${contentType}.json`;
    const cacheBuster = `?v=${Date.now()}`;

    const headers = new HttpHeaders({
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    });

    return this.http.get<ContentResponse<T>>(url + cacheBuster, { headers }).pipe(
      tap((data) => {
        this.cache.set(cacheKey, {
          data,
          expiresAt: Date.now() + environment.contentCacheMs,
        });
      }),
      catchError((err) => {
        console.error(`Failed to fetch content type "${contentType}" from Akamai:`, err);
        // Return cached stale data if available, else rethrow
        if (cached) {
          console.warn('Returning stale cached content');
          return of(cached.data);
        }
        return throwError(() => new Error(`Content fetch failed: ${err.message}`));
      })
    );
  }

  /**
   * Force refresh all cached content
   */
  invalidateCache(): void {
    this.cache.clear();
  }
}
