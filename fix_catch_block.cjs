const fs = require('fs');
const filePath = 'C:\\Users\\javie\\Downloads\\VTB_DEMO\\frontend\\src\\pages\\VotingBooth.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// Find the catch block by line-by-line scanning
const lines = content.split('\n');
let catchStart = -1;
let catchEnd = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('catch (err)') && i > 300 && catchStart === -1) {
    // Check if the next line has "Error al registrar"
    if (i + 1 < lines.length && lines[i+1].includes('registrar voto')) {
      catchStart = i;
    }
  }
  if (catchStart > 0 && i > catchStart && lines[i].trim() === '}') {
    catchEnd = i;
    break;
  }
}

if (catchStart < 0) {
  console.log('Could not find catch block');
  process.exit(1);
}

console.log(`Found catch block at lines ${catchStart + 1} to ${catchEnd + 1}`);

const newCatch = [
  '    } catch (err) {',
  '      console.error("Error al registrar voto:", err);',
  '',
  '      // Check for blockchain unavailability',
  '      if (err.response?.status === 500 &&',
  "          (err.response?.data?.error?.includes('blockchain') ||",
  "           err.response?.data?.error?.includes('Blockchain'))) {",
  '        setVoteError({',
  "          type: 'blockchain_unavailable',",
  "          message: 'El nodo blockchain no está disponible en este momento.',",
  "          detail: 'Asegúrate de que Hardhat está corriendo: npx hardhat node'",
  '        });',
  '      } else {',
  '        setVoteError(',
  '          err.response?.data?.error ||',
  '          err.message ||',
  '          "Error al registrar voto. Intenta de nuevo."',
  '        );',
  '      }',
  '      ',
  "      setVoteStatus('error');",
  '',
  '      if (err.response?.status === 401) {',
  '        setTimeout(() => navigate("/login"), 2000);',
  '      }',
  '    }'
];

lines.splice(catchStart, catchEnd - catchStart + 1, ...newCatch);
fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('Successfully replaced catch block');
