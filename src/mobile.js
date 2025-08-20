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
    
    // Only apply mobile carousel behavior on mobile devices
    if (window.innerWidth <= 768) {
      cards.forEach((card, index) => {
        card.dataset.cardIndex = index;
        
        // Add active indicator styling for first card
        if (index === 0) {
          card.classList.add('ring-2', 'ring-emerald-500', 'ring-opacity-50');
        }
      });
    }
    
    // Listen for scroll events to update indicators
    this.carousel.addEventListener('scroll', this.handleScroll.bind(this));
  }

  setupIndicators() {
    if (!this.indicators) return;
    
    this.indicators.innerHTML = '';
    
    for (let i = 0; i < this.totalCards; i++) {
      const dot = document.createElement('div');
      dot.className = `w-2 h-2 rounded-full cursor-pointer transition-all duration-200 touch-manipulation ${
        i === 0 ? 'bg-emerald-500 scale-110' : 'bg-zinc-600 hover:bg-zinc-400'
      }`;
      dot.dataset.index = i;
      dot.addEventListener('click', () => this.scrollToCard(i));
      this.indicators.appendChild(dot);
    }
  }

  setupTouchEvents() {
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let isDragging = false;
    let isScrolling = false;
    
    this.carousel.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startTime = Date.now();
      isDragging = true;
      isScrolling = false;
      
      // Store the starting scroll position
      this.startScrollLeft = this.carousel.scrollLeft;
    }, { passive: true });
    
    this.carousel.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      
      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      const deltaX = Math.abs(startX - currentX);
      const deltaY = Math.abs(startY - currentY);
      
      // Determine scroll direction on first significant movement
      if (!isScrolling && (deltaX > 5 || deltaY > 5)) {
        isScrolling = true;
        
        // If horizontal movement is dominant, prevent vertical scroll
        if (deltaX > deltaY && deltaX > 10) {
          if (e.cancelable) {
            e.preventDefault();
          }
        }
      }
    }, { passive: false });
    
    this.carousel.addEventListener('touchend', (e) => {
      if (!isDragging) return;
      
      const endTime = Date.now();
      const deltaTime = endTime - startTime;
      const deltaX = startX - e.changedTouches[0].clientX;
      
      // Detect swipe gestures (fast movement)
      if (deltaTime < 300 && Math.abs(deltaX) > 50) {
        const swipeThreshold = this.carousel.clientWidth * 0.3; // 30% of card width
        
        if (deltaX > swipeThreshold) {
          // Swipe left - next card
          this.nextCard();
        } else if (deltaX < -swipeThreshold) {
          // Swipe right - previous card
          this.prevCard();
        }
      } else {
        // Slow drag - snap to nearest card
        this.snapToNearestCard();
      }
      
      isDragging = false;
      isScrolling = false;
    }, { passive: true });
  }
  
  snapToNearestCard() {
    if (!this.carousel || window.innerWidth > 768) return;
    
    const cardWidth = this.carousel.clientWidth;
    const scrollLeft = this.carousel.scrollLeft;
    const nearestIndex = Math.round(scrollLeft / cardWidth);
    
    this.scrollToCard(nearestIndex);
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
    
    const dots = this.indicators.children;
    Array.from(dots).forEach((dot, index) => {
      if (index === this.currentCardIndex) {
        dot.className = 'w-2 h-2 rounded-full cursor-pointer transition-all duration-200 touch-manipulation bg-emerald-500 scale-110';
      } else {
        dot.className = 'w-2 h-2 rounded-full cursor-pointer transition-all duration-200 touch-manipulation bg-zinc-600 hover:bg-zinc-400';
      }
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
    
    // Update active card styling using Tailwind classes
    const cards = this.carousel.querySelectorAll('.discovery-card');
    cards.forEach((card, i) => {
      if (i === index) {
        card.classList.add('ring-2', 'ring-emerald-500', 'ring-opacity-50');
      } else {
        card.classList.remove('ring-2', 'ring-emerald-500', 'ring-opacity-50');
      }
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
    const resultsEl = document.getElementById('results');
    if (!resultsEl) return;
    
    // Apply mobile-specific classes for better scrolling
    if (window.innerWidth <= 768) {
      resultsEl.classList.add('mobile-results-height');
      
      // Enhance touch scrolling
      resultsEl.style.webkitOverflowScrolling = 'touch';
      resultsEl.style.scrollBehavior = 'smooth';
      
      // Add scroll momentum for better UX
      resultsEl.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: true });
      resultsEl.addEventListener('scroll', this.handleResultsScroll.bind(this), { passive: true });
    }
  }
  
  handleTouchStart(e) {
    // Store initial touch for momentum calculation
    this.touchStartY = e.touches[0].clientY;
    this.scrollStartTime = Date.now();
  }
  
  handleResultsScroll(e) {
    // Optional: Add scroll position persistence
    this.lastScrollPosition = e.target.scrollTop;
  }

  scrollToTop() {
    const resultsEl = document.getElementById('results');
    if (resultsEl) {
      resultsEl.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  }
  
  restoreScrollPosition() {
    const resultsEl = document.getElementById('results');
    if (resultsEl && this.lastScrollPosition) {
      resultsEl.scrollTop = this.lastScrollPosition;
    }
  }

  updateResults(html) {
    const resultsEl = document.getElementById('results');
    if (resultsEl) {
      resultsEl.innerHTML = html;
      this.scrollToTop();
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