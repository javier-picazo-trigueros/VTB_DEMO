#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fix UTF-8 encoding corruption in all JSX files
Replace corrupted character sequences with correct UTF-8 characters
"""

import os
import glob

def fix_encoding():
    replacements = [
        # Spanish accents
        ('dinÃ¡micamente', 'dinámicamente'),
        ('parÃ¡metros', 'parámetros'),
        ('ValidaciÃ³n', 'Validación'),
        ('Validaci\u0303', 'Validación'),
        ('votaciÃ³n', 'votación'),
        ('votaci\u0303', 'votación'),
        ('CRÃTICA', 'CRÍTICA'),
        ('CRÃ\u0081', 'CRÍ'),
        ('travÃ©s', 'través'),
        ('anÃ³nimo', 'anónimo'),
        ('an\u0303', 'anónimo'),
        ('envÃ­a', 'envía'),
        ('env\u0303', 'envía'),
        ('sÃ­', 'sí'),
        ('s\u0303', 'sí'),
        ('autenticaciÃ³n', 'autenticación'),
        ('autenticaci\u0303', 'autenticación'),
        ('auditorÃ­a', 'auditoría'),
        ('auditori\u0303', 'auditoría'),
        ('elecciÃ³n', 'elección'),
        ('elecci\u0303', 'elección'),
        ('ElecciÃ³n', 'Elección'),
        ('Elecci\u0303', 'Elección'),
        ('opciÃ³n', 'opción'),
        ('opci\u0303', 'opción'),
        ('sesÃ³n', 'sesión'),
        ('sesi\u0303', 'sesión'),
        ('pÃºblicamente', 'públicamente'),
        ('p\u0303', 'públicamente'),
        # Emojis with encoding issues
        ('ðŸ—³ï¸', '🗳️'),
        ('ðŸ" Š', '📊'),
        ('ðŸ" —', '🔗'),
        ('ðŸ" \'', '🔑'),
        ('âš¡', '⚡'),
        ('ðŸ" ¡', '📡'),
        ('ðŸ"', '🔐'),
        ('â†\'', '↩'),
        ('â€"', '—'),
        ('âœ\"', '✓'),
        ('ðŸ"', '🔔'),
        ('âŒ', '❌'),
        ('âœ…', '✅'),
        ('Ã²', 'ó'),
        ('Ã¡', 'á'),
        ('Ã©', 'é'),
        ('Ã­', 'í'),
        ('Ãº', 'ú'),
        ('Ã±', 'ñ'),
        ('Ã¼', 'ü'),
        ('Ã‚Â¡', '¡'),
        ('Ã‚Â¿', '¿'),
        # Multiple encoding corruption patterns
        ('ÃƒÂ°Ã…Â¸Ã¢â‚¬â€Ã‚Â³', '🗳️'),
        ('ðŸ"„', '🔄'),
        ('Ã¢ÂÂ±Ã¯Â¸Â', '⚠️'),
    ]
    
    # Find all JSX files
    jsx_files = glob.glob('**/*.jsx', recursive=True)
    
    print(f"Found {len(jsx_files)} JSX files to process")
    
    for file_path in jsx_files:
        if os.path.isfile(file_path):
            try:
                # Read file with UTF-8 encoding
                with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                    content = f.read()
                
                original_content = content
                
                # Apply all replacements
                for old, new in replacements:
                    content = content.replace(old, new)
                
                # Only write if content changed
                if content != original_content:
                    # Write with UTF-8 encoding (no BOM)
                    with open(file_path, 'w', encoding='utf-8-sig', newline='') as f:
                        f.write(content)
                    print(f'✓ Fixed: {file_path}')
                else:
                    print(f'✓ OK: {file_path} (no changes needed)')
            except Exception as e:
                print(f'✗ Error processing {file_path}: {e}')
    
    print('\n✓ All .jsx files processed!')

if __name__ == '__main__':
    os.chdir('c:\\Users\\javie\\Downloads\\VTB_DEMO\\frontend\\src')
    fix_encoding()
