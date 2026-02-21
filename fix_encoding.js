#!/usr/bin/env node
// Fix UTF-8 encoding corruption in all JSX files
const fs = require('fs');
const path = require('path');
const glob = require('glob');

const replacements = [
  // Spanish accents
  {old: /dinÃ¡micamente/g, new: 'dinámicamente'},
  {old: /parÃ¡metros/g, new: 'parámetros'},
  {old: /ValidaciÃ³n/g, new: 'Validación'},
  {old: /votaciÃ³n/g, new: 'votación'},
  {old: /CRÃTICA/g, new: 'CRÍTICA'},
  {old: /travÃ©s/g, new: 'através'},
  {old: /anÃ³nimo/g, new: 'anónimo'},
  {old: /envÃ­a/g, new: 'envía'},
  {old: /sÃ­/g, new: 'sí'},
  {old: /autenticaciÃ³n/g, new: 'autenticación'},
  {old: /auditorÃ­a/g, new: 'auditoría'},
  {old: /elecciÃ³n/g, new: 'elección'},
  {old: /ElecciÃ³n/g, new: 'Elección'},
  {old: /opciÃ³n/g, new: 'opción'},
  {old: /sesÃ³n/g, new: 'sesión'},
  {old: /pÃºblicamente/g, new: 'públicamente'},
  // Emoji corruption
  {old: /ðŸ—³ï¸/g, new: '🗳️'},
  {old: /ðŸ"Š/g, new: '📊'},
  {old: /ðŸ"—/g, new: '🔗'},
  {old: /ðŸ"'/g, new: '🔑'},
  {old: /âš¡/g, new: '⚡'},
  {old: /ðŸ"¡/g, new: '📡'},
  {old: /ðŸ"/g, new: '🔐'},
  {old: /â†'/g, new: '↩'},
  {old: /â€"/g, new: '—'},
  {old: /âœ"/g, new: '✓'},
  {old: /ðŸ"/g, new: '🔔'},
  {old: /âŒ/g, new: '❌'},
  {old: /âœ…/g, new: '✅'},
  // Latin-1 encoding corruption
  {old: /Ã²/g, new: 'ó'},
  {old: /Ã¡/g, new: 'á'},
  {old: /Ã©/g, new: 'é'},
  {old: /Ã­/g, new: 'í'},
  {old: /Ãº/g, new: 'ú'},
  {old: /Ã±/g, new: 'ñ'},
  {old: /Ã¼/g, new: 'ü'},
  {old: /Ã‚Â¡/g, new: '¡'},
  {old: /Ã‚Â¿/g, new: '¿'},
  // Complex corruption patterns
  {old: /ÃƒÂ°Ã…Â¸Ã¢â‚¬â€Ã‚Â³ÃƒÂ¯Ã‚Â¸Ã‚Â/g, new: '🗳️'},
  {old: /ðŸ"„/g, new: '🔄'},
  {old: /Ã¢ÂÂ±Ã¯Â¸Â/g, new: '⚠️'},
  {old: /ÃƒÆ'Ã‚Â³n/g, new: 'ón'},
  {old: /ÃƒÂ¢Ã‚ÂÃ…â€™/g, new: '⚠️'},
];

function fixJsxFiles() {
  const srcDir = path.join(__dirname, 'frontend', 'src');
  const jsxFiles = [];
  
  // Find all JSX files
  const findFiles = (dir) => {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        findFiles(filePath);
      } else if (file.endsWith('.jsx')) {
        jsxFiles.push(filePath);
      }
    });
  };
  
  findFiles(srcDir);
  
  console.log(`Found ${jsxFiles.length} JSX files`);
  
  jsxFiles.forEach(filePath => {
    try {
      let content = fs.readFileSync(filePath, 'utf8');
      const original = content;
      
      // Apply all replacements
      replacements.forEach(({old, new: newStr}) => {
        content = content.replace(old, newStr);
      });
      
      // Write back if changed
      if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`✓ Fixed: ${path.relative(srcDir, filePath)}`);
      } else {
        console.log(`✓ OK: ${path.relative(srcDir, filePath)}`);
      }
    } catch (err) {
      console.error(`✗ Error: ${filePath} - ${err.message}`);
    }
  });
  
  console.log('\n✓ All JSX files processed!');
}

fixJsxFiles();
