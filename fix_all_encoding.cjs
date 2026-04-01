const fs = require('fs');
const path = require('path');

const srcDirs = [
    'C:\\Users\\javie\\Downloads\\VTB_DEMO\\frontend\\src',
    'C:\\Users\\javie\\Downloads\\VTB_DEMO\\backend\\src'
];

const extensions = ['.js', '.jsx', '.ts', '.tsx'];

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
    [/Â/g, ''], // Clean up any lingering non-breaking spaces interpreted as Â
    [/Ã/g, 'í'],
];

function walkDir(dir, callback) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        if (isDirectory) {
            walkDir(dirPath, callback);
        } else {
            const ext = path.extname(dirPath);
            if (extensions.includes(ext)) {
                callback(dirPath);
            }
        }
    });
}

function processFiles() {
    let changedCount = 0;
    srcDirs.forEach(srcDir => {
        walkDir(srcDir, function (filePath) {
            let content = fs.readFileSync(filePath, 'utf8');
            let newContent = content;
            replacements.forEach(([regex, replacement]) => {
                newContent = newContent.replace(regex, replacement);
            });
            if (content !== newContent) {
                // Ensure the file is saved properly as UTF-8
                fs.writeFileSync(filePath, newContent, 'utf8');
                console.log('Fixed:', filePath);
                changedCount++;
            }
        });
    });
    console.log('Done! Files changed:', changedCount);
}

processFiles();
