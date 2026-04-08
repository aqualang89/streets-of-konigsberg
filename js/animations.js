/* ==============================================
   ANIMATIONS.JS — Scroll-анимации и параллакс
   История улиц Калининграда / Кёнигсберг
   ============================================== */

document.addEventListener('DOMContentLoaded', () => {

  /* ==========================================
     1. SCROLL REVEAL — появление элементов
     ========================================== */

  const revealClasses = ['.reveal', '.reveal-left', '.reveal-right'];

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        // Отписываемся после первого появления
        revealObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.12,
    rootMargin: '0px 0px -40px 0px'
  });

  revealClasses.forEach(cls => {
    document.querySelectorAll(cls).forEach(el => {
      revealObserver.observe(el);
    });
  });


  /* ==========================================
     2. ПАРАЛЛАКС — hero слои при скролле
     ========================================== */

  const heroDust = document.querySelector('.hero-dust');
  const heroBg   = document.querySelector('.hero-bg');
  const heroContent = document.querySelector('.hero-content');

  if (heroDust || heroBg) {
    // Плавный параллакс через requestAnimationFrame
    let ticking = false;
    let lastScrollY = 0;
    let currentDust = 0;
    let currentBg = 0;
    let currentContent = 0;
    let currentOpacity = 1;

    const lerp = (current, target, ease) => current + (target - current) * ease;

    const updateParallax = () => {
      const targetDust = lastScrollY * 0.08;
      const targetBg = lastScrollY * 0.04;
      const targetContent = lastScrollY * 0.12;
      const targetOpacity = Math.max(0, 1 - lastScrollY / 600);

      currentDust = lerp(currentDust, targetDust, 0.08);
      currentBg = lerp(currentBg, targetBg, 0.08);
      currentContent = lerp(currentContent, targetContent, 0.08);
      currentOpacity = lerp(currentOpacity, targetOpacity, 0.08);

      if (heroDust) {
        heroDust.style.transform = `translateY(${currentDust}px)`;
      }
      if (heroBg) {
        heroBg.style.transform = `translateY(${currentBg}px)`;
      }
      if (heroContent) {
        heroContent.style.transform = `translateY(${currentContent}px)`;
        heroContent.style.opacity = currentOpacity;
      }

      // Продолжаем анимацию пока есть разница
      if (Math.abs(currentDust - targetDust) > 0.1 ||
          Math.abs(currentContent - targetContent) > 0.1) {
        requestAnimationFrame(updateParallax);
      } else {
        ticking = false;
      }
    };

    const onParallax = () => {
      lastScrollY = window.scrollY;
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(updateParallax);
      }
    };

    window.addEventListener('scroll', onParallax, { passive: true });
  }


  /* ==========================================
     3. HERO — индикатор скролла исчезает
     ========================================== */

  const scrollHint = document.querySelector('.hero-scroll-hint');

  if (scrollHint) {
    const onScrollHint = () => {
      if (window.scrollY > 80) {
        scrollHint.style.opacity = '0';
        scrollHint.style.transition = 'opacity 0.5s ease';
      } else {
        scrollHint.style.opacity = '1';
      }
    };
    window.addEventListener('scroll', onScrollHint, { passive: true });
  }


  /* ==========================================
     4. СЧЁТЧИКИ — анимация цифр (если есть)
     ========================================== */

  const counters = document.querySelectorAll('[data-count]');

  if (counters.length) {
    const countObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;

        const el    = entry.target;
        const target = parseInt(el.dataset.count, 10);
        const duration = 1800;
        const start  = performance.now();

        const step = (now) => {
          const elapsed = now - start;
          const progress = Math.min(elapsed / duration, 1);
          // Easing: ease-out
          const eased = 1 - Math.pow(1 - progress, 3);
          el.textContent = Math.floor(eased * target);

          if (progress < 1) {
            requestAnimationFrame(step);
          } else {
            el.textContent = target;
          }
        };

        requestAnimationFrame(step);
        countObserver.unobserve(el);
      });
    }, { threshold: 0.5 });

    counters.forEach(el => countObserver.observe(el));
  }


  /* ==========================================
     5. МЕРЦАНИЕ ЗОЛОТЫХ ЭЛЕМЕНТОВ
        Случайные mini-pulse на декоре
     ========================================== */

  const goldElements = document.querySelectorAll('.ornament-center, .fact-icon');

  goldElements.forEach((el) => {
    // Случайная задержка для каждого элемента
    const delay = Math.random() * 3;
    el.style.animationDelay = `${delay}s`;
  });


  /* ==========================================
     6. HOVER-ЗВУК (визуальный) на карточках
        Усиление тени при наведении
     ========================================== */

  document.querySelectorAll('.street-card').forEach(card => {
    card.addEventListener('mouseenter', () => {
      card.style.boxShadow =
        '0 12px 48px rgba(0,0,0,0.7), 0 0 24px rgba(180,134,11,0.2)';
    });

    card.addEventListener('mouseleave', () => {
      card.style.boxShadow = '';
    });
  });


  /* ==========================================
     7. ПЛАВНЫЙ СКРОЛЛ К СЕКЦИИ
        Подсветка активной секции в navlinks
     ========================================== */

  const sections = document.querySelectorAll('section[id]');
  const navLinks  = document.querySelectorAll('.nav-link[href^="#"]');

  if (sections.length && navLinks.length) {
    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;

        const id = entry.target.getAttribute('id');
        navLinks.forEach(link => {
          if (link.getAttribute('href') === `#${id}`) {
            link.classList.add('active');
          } else {
            link.classList.remove('active');
          }
        });
      });
    }, {
      threshold: 0.4,
      rootMargin: '-60px 0px -40% 0px'
    });

    sections.forEach(s => sectionObserver.observe(s));
  }

});
