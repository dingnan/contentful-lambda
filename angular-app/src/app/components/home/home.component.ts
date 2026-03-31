import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ContentService } from '../../services/content.service';
import { Article } from '../../models/content.model';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent implements OnInit {
  articles: Article[] = [];
  loading = true;
  error: string | null = null;

  constructor(private contentService: ContentService) {}

  ngOnInit(): void {
    this.loadArticles();
  }

  loadArticles(): void {
    this.loading = true;
    this.error = null;

    this.contentService.getArticles().subscribe({
      next: (articles) => {
        this.articles = articles.sort((a, b) =>
          new Date(b.publishDate || b.updatedAt).getTime() -
          new Date(a.publishDate || a.updatedAt).getTime()
        );
        this.loading = false;
      },
      error: (err) => {
        this.error = 'Failed to load content. Please try again.';
        this.loading = false;
        console.error(err);
      },
    });
  }

  refresh(): void {
    this.contentService.invalidateCache();
    this.loadArticles();
  }
}
