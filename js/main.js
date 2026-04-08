/* ==============================================
   MAIN.JS — Навигация и общая логика
   История улиц Калининграда / Кёнигсберг
   ============================================== */

document.addEventListener('DOMContentLoaded', () => {

  // --- Прокрутка: добавляем класс .scrolled на навбар ---
  const nav = document.querySelector('.site-nav');

  if (nav) {
    const onScroll = () => {
      if (window.scrollY > 60) {
        nav.classList.add('scrolled');
      } else {
        nav.classList.remove('scrolled');
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // --- Активная ссылка в навигации ---
  const navLinks = document.querySelectorAll('.nav-link');
  const currentPath = window.location.pathname;

  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (!href) return;

    // Точное совпадение или страница в директории
    if (currentPath === href || currentPath.startsWith(href) && href !== '/') {
      link.classList.add('active');
    }

    // Для главной
    if (href === 'index.html' || href === '/' || href === './') {
      if (currentPath === '/' || currentPath.endsWith('index.html')) {
        link.classList.add('active');
      }
    }
  });

  // --- Плавный скролл к якорю на главной ---
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        const navHeight = nav ? nav.offsetHeight : 70;
        const top = target.getBoundingClientRect().top + window.scrollY - navHeight - 20;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

  // --- Переход страницы: fade-in при загрузке ---
  document.body.style.opacity = '0';
  document.body.style.transition = 'opacity 0.5s ease';

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.style.opacity = '1';
    });
  });

  // --- Переход при клике на карточки улиц ---
  document.querySelectorAll('.street-card[href]').forEach(card => {
    card.addEventListener('click', (e) => {
      const href = card.getAttribute('href');
      if (!href || href.startsWith('#')) return;

      e.preventDefault();

      document.body.style.opacity = '0';
      setTimeout(() => {
        window.location.href = href;
      }, 400);
    });
  });

  // --- Переход при клике кнопки "Назад" ---
  document.querySelectorAll('.back-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const href = btn.getAttribute('href');
      document.body.style.opacity = '0';
      setTimeout(() => {
        window.location.href = href;
      }, 400);
    });
  });

});
