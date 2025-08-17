/**
 * Mobile-specific functionality for carousel cards and gesture navigation
 */

export class MobileCarousel {
  constructor() {
    this.currentCardIndex = 0;
    this.totalCards = 0;
    this.carousel = null;
    this.indicators = null;
    this.isInitialized = false;
  }

  init() {
    if (this.isInitialized) return;
    
    this.carousel = document.querySelector('.discovery-carousel');
    this.indicators = document.querySelector('.carousel-indicators');
    
    if (!this.carousel) return;
    
    this.setupCarousel();
    this.setupIndicators();
    this.setupTouchEvents();
    this.setupResizeHandler();
    
    this.isInitialized = true;
  }

  setupCarousel() {
    const cards = this.carousel.querySelectorAll('.discovery-card');
    this.totalCards = cards.length;
    
    // Set up scroll snap behavior
    this.carousel.style.scrollSnapType = 'x mandatory';
    this.carousel.style.overflowX = 'auto';
    this.carousel.style.display = 'flex';
    
    cards.forEach((card, index) => {
      card.style.scrollSnapAlign = 'start';
      card.style.flexShrink = '0';
      card.style.width = '100%';
      card.dataset.cardIndex = index;
    });
    
    // Listen for scroll events to update indicators
    this.carousel.addEventListener('scroll', this.handleScroll.bind(this));
  }

  setupIndicators() {
    if (!this.indicators) return;
    
    this.indicators.innerHTML = '';
    
    for (let i = 0; i < this.totalCards; i++) {
      const dot = document.createElement('div');
      dot.className = `indicator-dot ${i === 0 ? 'active' : ''}`;
      dot.dataset.index = i;
      dot.addEventListener('click', () => this.scrollToCard(i));
      this.indicators.appendChild(dot);
    }
  }

  setupTouchEvents() {
    let startX = 0;
    let startY = 0;
    let isDragging = false;
    
    this.carousel.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      isDragging = true;
    }, { passive: true });
    
    this.carousel.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      
      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      const deltaX = Math.abs(startX - currentX);
      const deltaY = Math.abs(startY - currentY);
      
      // Only prevent default if horizontal swipe is dominant AND event is cancelable
      if (deltaX > deltaY && deltaX > 10 && e.cancelable) {
        e.preventDefault();
      }
    }, { passive: false }); // Need passive: false to call preventDefault
    
    this.carousel.addEventListener('touchend', () => {
      isDragging = false;
    }, { passive: true });
  }

  setupResizeHandler() {
    window.addEventListener('resize', () => {
      // Recalculate card positions after resize
      this.scrollToCard(this.currentCardIndex, false);
    });
  }

  handleScroll() {
    if (!this.carousel) return;
    
    const cardWidth = this.carousel.clientWidth;
    const scrollLeft = this.carousel.scrollLeft;
    const newIndex = Math.round(scrollLeft / cardWidth);
    
    if (newIndex !== this.currentCardIndex) {
      this.currentCardIndex = newIndex;
      this.updateIndicators();
      this.onCardChange(newIndex);
    }
  }

  updateIndicators() {
    if (!this.indicators) return;
    
    const dots = this.indicators.querySelectorAll('.indicator-dot');
    dots.forEach((dot, index) => {
      dot.classList.toggle('active', index === this.currentCardIndex);
    });
  }

  scrollToCard(index, smooth = true) {
    if (!this.carousel || index < 0 || index >= this.totalCards) return;
    
    const cardWidth = this.carousel.clientWidth;
    const scrollLeft = index * cardWidth;
    
    this.carousel.scrollTo({
      left: scrollLeft,
      behavior: smooth ? 'smooth' : 'instant'
    });
  }

  onCardChange(index) {
    // Emit custom event for other components to listen to
    const event = new CustomEvent('cardChanged', {
      detail: { cardIndex: index }
    });
    document.dispatchEvent(event);
    
    // Update active card styling
    const cards = this.carousel.querySelectorAll('.discovery-card');
    cards.forEach((card, i) => {
      card.classList.toggle('active', i === index);
    });
  }

  // Public methods for external control
  nextCard() {
    if (this.currentCardIndex < this.totalCards - 1) {
      this.scrollToCard(this.currentCardIndex + 1);
    }
  }

  prevCard() {
    if (this.currentCardIndex > 0) {
      this.scrollToCard(this.currentCardIndex - 1);
    }
  }

  getCurrentCard() {
    return this.currentCardIndex;
  }

  getCardElement(index) {
    return this.carousel?.querySelector(`[data-card-index="${index}"]`);
  }
}

// Results container management
export class MobileResults {
  constructor() {
    this.resultsContainer = null;
    this.isInitialized = false;
  }

  init() {
    if (this.isInitialized) return;
    
    this.resultsContainer = document.querySelector('.results-container');
    if (!this.resultsContainer) return;
    
    this.setupResultsContainer();
    this.isInitialized = true;
  }

  setupResultsContainer() {
    // Set fixed height and scrollable behavior
    this.resultsContainer.style.height = '50vh';
    this.resultsContainer.style.overflowY = 'auto';
    this.resultsContainer.style.webkitOverflowScrolling = 'touch';
    
    // Add momentum scrolling for iOS
    this.resultsContainer.style.webkitOverflowScrolling = 'touch';
  }

  scrollToTop() {
    if (this.resultsContainer) {
      this.resultsContainer.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  }

  updateResults(html) {
    if (this.resultsContainer) {
      const resultsContent = this.resultsContainer.querySelector('#results');
      if (resultsContent) {
        resultsContent.innerHTML = html;
        this.scrollToTop();
      }
    }
  }
}

// Device detection utility
export function isMobileDevice() {
  return window.innerWidth <= 768 || 
         /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Initialize mobile components when DOM is ready
let mobileCarousel = null;
let mobileResults = null;

export function initMobile() {
  if (!isMobileDevice()) return;
  
  mobileCarousel = new MobileCarousel();
  mobileResults = new MobileResults();
  
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      mobileCarousel.init();
      mobileResults.init();
    });
  } else {
    mobileCarousel.init();
    mobileResults.init();
  }
}

// Auto-initialize when the module loads
initMobile();

// Export instances for external access
export { mobileCarousel, mobileResults };