---
name: security-audit
description: Use for security reviews, vulnerability scanning,
  checking for SQL injection, XSS, authentication issues,
  OWASP Top 10 vulnerabilities, and security best practices
---

# Security Audit

Perform a security audit checking for:

## Injection Vulnerabilities

- SQL injection (string concatenation in queries)
- Command injection (unsanitized shell commands)
- LDAP injection
- XPath injection

## Authentication Issues

- Hardcoded credentials
- Weak password requirements
- Missing rate limiting
- Session management flaws

## Sensitive Data

- Plaintext passwords
- API keys in code
- Logging sensitive information
- Missing encryption

## Access Control

- Missing authorization checks
- Insecure direct object references
- Path traversal vulnerabilities

## Output

For each issue found, provide:

1. File and line number
2. Vulnerability type
3. Severity (CRITICAL/HIGH/MEDIUM/LOW)
4. Recommended fix
