import { ContentAnalysis } from '../types';

export class ContentAnalyzer {
  private viewportHeight: number;
  private viewportWidth: number;
  private lastAnalysisTime: number = 0;
  private analysisCache: ContentAnalysis | null = null;

  constructor() {
    this.viewportHeight = window.innerHeight;
    this.viewportWidth = window.innerWidth;
    
    window.addEventListener('resize', () => {
      this.viewportHeight = window.innerHeight;
      this.viewportWidth = window.innerWidth;
    });
  }

  analyzeViewport(): ContentAnalysis {
    // Cache results for 100ms to prevent over-analyzing
    const now = Date.now();
    if (this.analysisCache && (now - this.lastAnalysisTime) < 100) {
      return this.analysisCache;
    }

    // Only analyze specific content elements, not everything
    const contentSelectors = 'p, h1, h2, h3, h4, h5, h6, img, article, section, div.content, div.post, div.comment';
    const elements = document.querySelectorAll(contentSelectors);
    
    // Limit to elements actually in viewport
    const visibleElements: Element[] = [];
    const viewportTop = window.scrollY;
    const viewportBottom = viewportTop + this.viewportHeight;
    
    // Only check first 50 elements for performance
    const elementsToCheck = Math.min(elements.length, 50);
    
    for (let i = 0; i < elementsToCheck; i++) {
      const el = elements[i];
      const rect = el.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      const bottom = top + rect.height;
      
      // Check if in or near viewport (with 100px buffer)
      if (bottom > viewportTop - 100 && top < viewportBottom + 100) {
        visibleElements.push(el);
      }
    }

    const textDensity = this.calculateSimpleTextDensity(visibleElements);
    const hasImages = visibleElements.some(el => el.tagName === 'IMG');
    const whitespaceRatio = this.calculateSimpleWhitespaceRatio(visibleElements);

    this.analysisCache = {
      textDensity,
      hasImages,
      whitespaceRatio,
      panelBoundaries: [],
      contentType: 'unknown',
      averageTextSize: 16
    };

    this.lastAnalysisTime = now;
    return this.analysisCache;
  }

  private calculateSimpleTextDensity(elements: Element[]): number {
    if (elements.length === 0) return 0.5;

    let textElementCount = 0;
    elements.forEach(el => {
      if (el.textContent && el.textContent.trim().length > 20) {
        textElementCount++;
      }
    });

    return Math.min(1, textElementCount / Math.max(elements.length, 1));
  }

  private calculateSimpleWhitespaceRatio(elements: Element[]): number {
    if (elements.length === 0) return 0.5;

    // Simple check - if very few elements in viewport, probably whitespace
    if (elements.length < 3) return 0.8;
    if (elements.length < 5) return 0.6;
    
    return 0.2;
  }

  getDebugInfo(): string {
    const analysis = this.analyzeViewport();
    return `
      Text Density: ${(analysis.textDensity * 100).toFixed(1)}%
      Whitespace: ${(analysis.whitespaceRatio * 100).toFixed(1)}%
      Has Images: ${analysis.hasImages}
    `;
  }
}