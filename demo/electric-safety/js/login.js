document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('loginForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const btn = form.querySelector('.btn');

    const API_BASE_URL = '/api/auth';

    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        let isValid = true;

        isValid = validateUsername(usernameInput) && isValid;
        isValid = validatePassword(passwordInput) && isValid;

        if (isValid) {
            login();
        }
    });

    usernameInput.addEventListener('blur', function() {
        validateUsername(this);
    });

    passwordInput.addEventListener('blur', function() {
        validatePassword(this);
    });

    usernameInput.addEventListener('input', function() {
        clearError(this);
    });

    passwordInput.addEventListener('input', function() {
        clearError(this);
    });

    async function login() {
        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        setLoading(true);

        try {
            const response = await fetch(`${API_BASE_URL}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (response.ok) {
            showAlert('success', `登录成功！欢迎回来，${data.username}`);
            localStorage.setItem('token', data.token);
            localStorage.setItem('username', data.username);
            
            setTimeout(() => {
                window.location.href = 'chat.html';
            }, 1500);
        } else {
                showAlert('error', data.message || '登录失败');
            }
        } catch (error) {
            showAlert('error', '网络连接失败，请检查服务器是否启动');
        } finally {
            setLoading(false);
        }
    }

    function validateUsername(input) {
        const value = input.value.trim();
        const errorElement = input.parentElement.querySelector('.error');

        if (value === '') {
            showError(input, errorElement, '请输入用户名');
            return false;
        }

        if (value.length < 3) {
            showError(input, errorElement, '用户名至少需要3个字符');
            return false;
        }

        clearError(input);
        return true;
    }

    function validatePassword(input) {
        const value = input.value;
        const errorElement = input.parentElement.querySelector('.error');

        if (value === '') {
            showError(input, errorElement, '请输入密码');
            return false;
        }

        if (value.length < 6) {
            showError(input, errorElement, '密码至少需要6个字符');
            return false;
        }

        clearError(input);
        return true;
    }

    function showError(input, errorElement, message) {
        input.parentElement.classList.add('has-error');
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }

    function clearError(input) {
        input.parentElement.classList.remove('has-error');
        const errorElement = input.parentElement.querySelector('.error');
        if (errorElement) {
            errorElement.textContent = '';
            errorElement.style.display = 'none';
        }
    }

    function showAlert(type, message) {
        const alertDiv = document.getElementById('alert');
        alertDiv.className = `alert ${type}`;
        alertDiv.textContent = message;
    }

    function setLoading(isLoading) {
        btn.disabled = isLoading;
        btn.textContent = isLoading ? '登录中...' : '登 录';
    }
});