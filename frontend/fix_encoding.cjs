const fs = require('fs');
const path = require('path');

const srcDir = 'C:\\Users\\javie\\Downloads\\VTB_DEMO\\frontend\\src';
const targetDirs = ['pages', 'components', 'context'];

const replacements = [
    [/ÃƒÂ³/g, 'ó'],
    [/ÃƒÂ¡/g, 'á'],
    [/Ã³/g, 'ó'],
    [/Ã¡/g, 'á'],
    [/Ã©/g, 'é'],
    [/Ã\xAD/g, 'í'],
    [/Ãº/g, 'ú'],
    [/Ã±/g, 'ñ'],
    [/Ã¼/g, 'ü'],
    [/ðŸ—³ï¸/g, '🗳️'],
    [/âœ…/g, '✅'],
    [/ðŸ“Š/g, '📊'],
    [/ðŸ”—/g, '🔗'],
    [/ðŸ”‘/g, '🔑'],
    [/âš¡/g, '⚡'],
    [/ðŸ“¡/g, '📡'],
    [/ðŸ” /g, '🔐'],
    [/â†©/g, '↩'],
    [/â€”/g, '—'],
    [/â€˜/g, "'"],
    [/â€™/g, "'"],
    [/Â¡/g, '¡'],
    [/Â¿/g, '¿'],
    [/â Œ/g, '❌'],
    [/â ³/g, '⏳'],
    [/âš ï¸/g, '⚠️'],
    [/ðŸ“ /g, '📌'],
    [/ðŸ“¤/g, '📤'],
    [/ðŸ“‹/g, '📋'],
    [/ðŸ”„/g, '🔄'],
    [/â† /g, '←'],
    [/â†'/g, '↩'],
    [/â€"/g, '—'],
    [/ðŸ""/g, '🔐'],
    [/ðŸ"¡/g, '📡'],
    [/ðŸ"'/g, '🔑'],
    [/ðŸ"—/g, '🔗'],
    [/ðŸ"Š/g, '📊'],
    [/Ã/g, 'í'], // Any remaining Ã becomes í
];

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        if (isDirectory) {
            walkDir(dirPath, callback);
        } else if (f.endsWith('.jsx')) {
            callback(dirPath);
        }
    });
}

let changedCount = 0;

targetDirs.forEach(dir => {
    let fullDir = path.join(srcDir, dir);
    if (fs.existsSync(fullDir)) {
        walkDir(fullDir, function (filePath) {
            let content = fs.readFileSync(filePath, 'utf8');
            let newContent = content;
            replacements.forEach(([regex, replacement]) => {
                newContent = newContent.replace(regex, replacement);
            });
            if (content !== newContent) {
                fs.writeFileSync(filePath, newContent, 'utf8');
                console.log('Fixed:', filePath);
                changedCount++;
            }
        });
    }
});

console.log('Done! Files changed:', changedCount);
