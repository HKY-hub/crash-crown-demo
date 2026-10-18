document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('registerForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const btn = form.querySelector('.btn');

    const API_BASE_URL = '/api/auth';

    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        let isValid = true;

        isValid = validateUsername(usernameInput) && isValid;
        isValid = validatePassword(passwordInput) && isValid;
        isValid = validateConfirmPassword(confirmPasswordInput, passwordInput.value) && isValid;

        if (isValid) {
            register();
        }
    });

    usernameInput.addEventListener('blur', function() {
        validateUsername(this);
    });

    passwordInput.addEventListener('blur', function() {
        validatePassword(this);
    });

    confirmPasswordInput.addEventListener('blur', function() {
        validateConfirmPassword(this, passwordInput.value);
    });

    usernameInput.addEventListener('input', function() {
        clearError(this);
    });

    passwordInput.addEventListener('input', function() {
        clearError(this);
        const confirmError = confirmPasswordInput.parentElement.querySelector('.error');
        if (confirmError) {
            confirmError.textContent = '';
            confirmError.style.display = 'none';
        }
        confirmPasswordInput.parentElement.classList.remove('has-error');
    });

    confirmPasswordInput.addEventListener('input', function() {
        clearError(this);
    });

    async function register() {
        const username = usernameInput.value.trim();
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        setLoading(true);

        try {
            const response = await fetch(`${API_BASE_URL}/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password, confirmPassword })
            });

            const data = await response.json();

            if (response.ok) {
                showAlert('success', '注册成功！即将跳转至登录页面...');
                
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 2000);
            } else {
                showAlert('error', data.message || '注册失败');
                if (data.errors) {
                    Object.keys(data.errors).forEach(field => {
                        const input = document.getElementById(field);
                        if (input) {
                            const errorElement = input.parentElement.querySelector('.error');
                            showError(input, errorElement, data.errors[field]);
                        }
                    });
                }
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

        if (value.length > 20) {
            showError(input, errorElement, '用户名最多20个字符');
            return false;
        }

        const usernameRegex = /^[a-zA-Z0-9_]+$/;
        if (!usernameRegex.test(value)) {
            showError(input, errorElement, '用户名只能包含字母、数字和下划线');
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

        if (value.length > 30) {
            showError(input, errorElement, '密码最多30个字符');
            return false;
        }

        clearError(input);
        return true;
    }

    function validateConfirmPassword(input, password) {
        const value = input.value;
        const errorElement = input.parentElement.querySelector('.error');

        if (value === '') {
            showError(input, errorElement, '请确认密码');
            return false;
        }

        if (value !== password) {
            showError(input, errorElement, '两次输入的密码不一致');
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
        btn.textContent = isLoading ? '注册中...' : '注 册';
    }
});