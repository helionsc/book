/* Compara as doses do app integrado com as do HTML original.
   Qualquer divergencia e um erro de migracao — e em dose pediatrica
   uma divergencia de 10x e plausivel e invisivel. */
const fs=require('fs');
const src=fs.readFileSync(process.argv[2] || '../ficha-parada-pediatrica.html','utf8');
const bloco=src.match(/const D = \[(.*?)\n\];/s)[1];
const ORIG=eval('['+bloco+']');
const NOVO=JSON.parse(fs.readFileSync(require('path').join(__dirname,'../public/conteudo.json'),'utf8'))
  .itens.find(i=>i.id==='pcr-pediatrica').drogas;

console.log('originais:', ORIG.length, '| migradas:', NOVO.length);
let f=0;
const casos=[[3,0],[10,3],[18,6],[35,12],[60,16],[80,19]];
for(const o of ORIG){
  const n=NOVO.find(x=>x.nome===o.n);
  if(!n){ console.log('FALTA:',o.n); f++; continue; }
  ['ap:apres','dose:dose','dil:diluente','pr:proporcao'].forEach(par=>{
    const [a,b]=par.split(':');
    if(o[a]!==n[b]){ console.log(`CAMPO ${o.n}.${a}: "${o[a]}" != "${n[b]}"`); f++; }
  });
  if((o.max??null)!==(n.max??null)){ console.log(`MAX ${o.n}: ${o.max} != ${n.max}`); f++; }
  for(const [p,a] of casos){
    const v1=o.f(p,a);
    const v2=new Function('p','a',`return (${n.formula});`)(p,a);
    if(Math.abs(v1-v2)>1e-9){ console.log(`DOSE ${o.n} @ ${p}kg/${a}a: ${v1} != ${v2}`); f++; }
  }
}
console.log(f?`\nDIVERGENCIAS: ${f}`:'\nparidade total: doses identicas ao original em todos os casos');
process.exit(f?1:0);
