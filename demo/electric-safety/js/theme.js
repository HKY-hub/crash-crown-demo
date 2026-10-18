/**
 * 主题切换公共脚本
 * 所有页面都应引用此脚本，页面加载时自动应用保存的主题
 */

(function() {
    // 主题配置
    const themes = {
        blue: {
            '--pc-primary': '#0052CC',
            '--pc-primary-dark': '#003D99',
            '--pc-primary-deep': '#002B66',
            '--pc-primary-light': '#266FE6',
            '--pc-primary-lighter': '#5C95FF',
            '--pc-primary-pale': '#E6F0FF',
            '--pc-shadow-primary': '0 8px 24px rgba(0, 82, 204, 0.25)',
            '--pc-gradient-primary': 'linear-gradient(135deg, #0052CC 0%, #266FE6 100%)',
            '--pc-gradient-hero': 'linear-gradient(135deg, #0052CC 0%, #003D99 40%, #002B66 100%)'
        },
        green: {
            '--pc-primary': '#00B42A',
            '--pc-primary-dark': '#009A29',
            '--pc-primary-deep': '#007A22',
            '--pc-primary-light': '#23C343',
            '--pc-primary-lighter': '#4CD263',
            '--pc-primary-pale': '#E8FFEA',
            '--pc-shadow-primary': '0 8px 24px rgba(0, 180, 42, 0.25)',
            '--pc-gradient-primary': 'linear-gradient(135deg, #00B42A 0%, #23C343 100%)',
            '--pc-gradient-hero': 'linear-gradient(135deg, #007A22 0%, #009A29 40%, #00B42A 100%)'
        },
        orange: {
            '--pc-primary': '#FF7D00',
            '--pc-primary-dark': '#D46B08',
            '--pc-primary-deep': '#AD4E00',
            '--pc-primary-light': '#FF9A2E',
            '--pc-primary-lighter': '#FFB85C',
            '--pc-primary-pale': '#FFF7E6',
            '--pc-shadow-primary': '0 8px 24px rgba(255, 125, 0, 0.25)',
            '--pc-gradient-primary': 'linear-gradient(135deg, #FF7D00 0%, #FF9A2E 100%)',
            '--pc-gradient-hero': 'linear-gradient(135deg, #AD4E00 0%, #D46B08 40%, #FF7D00 100%)'
        },
        dark: {
            '--pc-primary': '#3370FF',
            '--pc-primary-dark': '#1D5AD9',
            '--pc-primary-deep': '#0F42B3',
            '--pc-primary-light': '#4C88FF',
            '--pc-primary-lighter': '#6BA3FF',
            '--pc-primary-pale': 'rgba(51, 112, 255, 0.2)',
            '--pc-shadow-primary': '0 8px 24px rgba(51, 112, 255, 0.3)',
            '--pc-gradient-primary': 'linear-gradient(135deg, #3370FF 0%, #4C88FF 100%)',
            '--pc-gradient-hero': 'linear-gradient(135deg, #0F42B3 0%, #1D5AD9 40%, #3370FF 100%)',
            '--pc-bg-body': '#1d2129',
            '--pc-bg-card': '#2a2f3a',
            '--pc-bg-panel': '#242934',
            '--pc-text-primary': '#e5e6eb',
            '--pc-text-secondary': '#a8abb2',
            '--pc-text-tertiary': '#7a7d83',
            '--pc-text-inverse': '#1d2129',
            '--pc-border-light': '#3a3f4b',
            '--pc-border-medium': '#4e5969',
            '--pc-border-dark': '#6b7280',
            '--pc-metal-900': '#1d2129',
            '--pc-metal-800': '#2a2f3a',
            '--pc-metal-700': '#3a3f4b',
            '--pc-metal-600': '#4e5969',
            '--pc-metal-500': '#6b7280',
            '--pc-metal-400': '#7a7d83',
            '--pc-metal-300': '#a8abb2',
            '--pc-metal-200': '#2a2f3a',
            '--pc-metal-100': '#242934',
            '--pc-metal-50': '#1d2129'
        }
    };

    // 应用主题
    function applyTheme(themeName) {
        const theme = themes[themeName];
        if (!theme) return;

        const root = document.documentElement;
        Object.keys(theme).forEach(function(key) {
            root.style.setProperty(key, theme[key]);
        });

        // 保存到本地存储
        try {
            localStorage.setItem('theme', themeName);
        } catch(e) {}
    }

    // 获取当前主题
    function getCurrentTheme() {
        try {
            return localStorage.getItem('theme') || 'blue';
        } catch(e) {
            return 'blue';
        }
    }

    // 页面加载时自动应用主题
    function initTheme() {
        const savedTheme = getCurrentTheme();
        applyTheme(savedTheme);
    }

    // 暴露全局方法
    window.ThemeManager = {
        applyTheme: applyTheme,
        getCurrentTheme: getCurrentTheme,
        themes: Object.keys(themes)
    };

    // 立即执行（在DOM加载前就应用主题，避免闪烁）
    initTheme();
})();
