(function () {
  const storageKey = "portfolio-loader-shown";
  const root = document.documentElement;

  try {
    if (sessionStorage.getItem(storageKey)) {
      root.classList.add("portfolio-loader-skip");
      const skipStyles = document.createElement("style");
      skipStyles.textContent =
        "html.portfolio-loader-skip .pre_loader-wrap, html.portfolio-loader-skip .mobile-preloader { display: none !important; }";
      document.head.appendChild(skipStyles);
      return;
    }

    sessionStorage.setItem(storageKey, "1");
  } catch {
    // If session storage is unavailable, let the normal page loader run.
  }
})();