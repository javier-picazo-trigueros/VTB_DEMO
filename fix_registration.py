#!/usr/bin/env python3
import re

print("Fixing registration flow...")

# Read the frontend file
with open('frontend/src/pages/Login.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Fix the axios request body
old_body = '''"{${API_URL}/auth/register-request", {
        email: requestData.email,
        name: requestData.name,
        student_id: requestData.student_id,
      });'''

new_body = '''${API_URL}/auth/register-request", {
        email: requestData.email,
        fullName: requestData.name,
        studentId: requestData.student_id,
        name: requestData.name,
        student_id: requestData.student_id
      }, {
        timeout: 10000
      });'''

if 'API_URL}/auth/register-request' in content:
    # Find and replace the exact axios call
    content = re.sub(
        r'axios\.post\(`\$\{API_URL\}/auth/register-request`, \{\s*email: requestData\.email,\s*name: requestData\.name,\s*student_id: requestData\.student_id,\s*\}\);',
        '''axios.post(`${API_URL}/auth/register-request`, {
        email: requestData.email,
        fullName: requestData.name,
        studentId: requestData.student_id,
        name: requestData.name,
        student_id: requestData.student_id
      }, {
        timeout: 10000
      });''',
        content
    )

# 2. Add better error handling if not already there
if 'status === 409' not in content:
    # Replace the simple catch block
    old_catch = '''} catch (err) {
      console.error("Error en solicitud:", err);
      setError(err.response?.data?.error || "Error al enviar solicitud");
    } finally {
      setLoading(false);
    }
  };'''

    new_catch = '''} catch (err) {
      console.error("Error en solicitud:", err);
      
      if (err.response?.status === 409) {
        setError("Este email ya tiene una solicitud pendiente o una cuenta activa");
      } else if (err.response?.status === 400) {
        setError(err.response?.data?.error || "Revisa los datos e intenta de nuevo");
      } else if (err.code === 'ECONNABORTED') {
        setError("Tiempo de conexión agotado. Verifica que el servidor esté activo");
      } else if (err.code === 'ECONNREFUSED' || !err.response) {
        setError("No se pudo conectar al servidor. Intenta más tarde");
      } else {
        setError(err.response?.data?.error || "Error al enviar solicitud");
      }
    } finally {
      setLoading(false);
    }
  };'''
    
    content = content.replace(old_catch, new_catch)

# Write back
with open('frontend/src/pages/Login.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("✓ Frontend Login.jsx updated")
