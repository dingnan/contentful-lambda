import { Component } from '@angular/core';
import { RouterOutlet, RouterModule } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterModule],
  template: `
    <nav class="navbar">
      <a routerLink="/" class="navbar__brand">My Site</a>
      <span class="navbar__badge">Powered by Contentful + Akamai</span>
    </nav>
    <main>
      <router-outlet />
    </main>
  `,
  styles: [`
    .navbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem 2rem;
      background: #1a1a2e;
      color: white;
    }
    .navbar__brand {
      font-size: 1.25rem;
      font-weight: 700;
      color: white;
      text-decoration: none;
    }
    .navbar__badge {
      font-size: 0.75rem;
      color: #9ca3af;
    }
    main {
      min-height: calc(100vh - 60px);
      background: #f9fafb;
    }
  `],
})
export class AppComponent {}
