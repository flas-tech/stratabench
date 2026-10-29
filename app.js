(function () {
  var root = document.documentElement;
  var prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  var theme = prefersLight ? 'light' : 'dark';
  root.setAttribute('data-theme', theme);

  var btn = document.getElementById('theme');
  if (btn) {
    btn.addEventListener('click', function () {
      theme = theme === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', theme);
    });
  }

  var yr = document.getElementById('yr');
  if (yr) yr.textContent = new Date().getFullYear();

  // reveal on scroll
  var targets = document.querySelectorAll('.card, .steps li, .mini, .split-copy, .split-fig');
  Array.prototype.forEach.call(targets, function (el) { el.setAttribute('data-reveal', ''); });
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    Array.prototype.forEach.call(targets, function (el) { io.observe(el); });
  } else {
    Array.prototype.forEach.call(targets, function (el) { el.classList.add('in'); });
  }

  var form = document.getElementById('quote');
  var note = document.getElementById('form-note');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = form.querySelector('#f-name');
      var email = form.querySelector('#f-email');
      if (!name.value.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value)) {
        note.textContent = 'Add your name and a valid work email so we can reply.';
        note.classList.remove('ok');
        return;
      }
      note.textContent = 'Request captured locally. This demo does not send mail — email flow@flitelineaviation.com to reach us.';
      note.classList.add('ok');
    });
  }
})();
