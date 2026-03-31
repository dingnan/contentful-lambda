import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { ContentService } from '../../services/content.service';
import { Article } from '../../models/content.model';

@Component({
  selector: 'app-article',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="article-page">
      <a routerLink="/" class="back-link">← Back to Articles</a>

      <div class="loading" *ngIf="loading">Loading article...</div>

      <div class="not-found" *ngIf="!loading && !article">
        <h2>Article not found</h2>
        <a routerLink="/">Go home</a>
      </div>

      <article class="article" *ngIf="!loading && article">
        <header class="article__header">
          <time *ngIf="article.publishDate">
            {{ article.publishDate | date: 'longDate' }}
          </time>
          <h1>{{ article.title }}</h1>
          <p class="article__summary" *ngIf="article.summary">{{ article.summary }}</p>
        </header>

        <div class="article__hero" *ngIf="article.image">
          <img
            [src]="'https:' + article.image?.fields?.file?.url"
            [alt]="article.image?.fields?.title"
          />
        </div>

        <div class="article__body" *ngIf="article.body">
          <!-- Rich text rendering would need @contentful/rich-text-html-renderer -->
          <p>{{ article.body }}</p>
        </div>
      </article>
    </div>
  `,
  styles: [`
    .article-page {
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem 1.5rem;
    }
    .back-link {
      color: #4f46e5;
      text-decoration: none;
      font-size: 0.9rem;
      display: inline-block;
      margin-bottom: 2rem;
    }
    .article__header {
      margin-bottom: 2rem;
      time { color: #888; font-size: 0.85rem; display: block; margin-bottom: 0.5rem; }
      h1 { font-size: 2rem; font-weight: 700; color: #1a1a2e; line-height: 1.3; }
    }
    .article__summary {
      font-size: 1.15rem;
      color: #555;
      margin-top: 1rem;
      line-height: 1.6;
    }
    .article__hero img {
      width: 100%;
      border-radius: 12px;
      margin-bottom: 2rem;
    }
    .article__body {
      line-height: 1.8;
      color: #374151;
      font-size: 1.05rem;
    }
    .loading, .not-found {
      text-align: center;
      padding: 4rem;
      color: #888;
    }
  `],
})
export class ArticleComponent implements OnInit {
  article?: Article;
  loading = true;

  constructor(
    private route: ActivatedRoute,
    private contentService: ContentService
  ) {}

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('slug') || '';
    this.contentService.getArticleBySlug(slug).subscribe({
      next: (article) => {
        this.article = article;
        this.loading = false;
      },
      error: () => (this.loading = false),
    });
  }
}
