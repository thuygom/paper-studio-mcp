export function documentCandidates(files) {
  return files.filter(file => file.path.endsWith('.tex')).map(file => {
    const content = file.content.replace(/(?<!\\)%.*$/gm, '');
    const directive = file.content.match(/^\s*%\s*!TEX\s+(?:TS-)?program\s*=\s*(pdflatex|xelatex|lualatex)\b/im)?.[1].toLowerCase();
    const engine = directive || (/\\(?:directlua|usepackage\s*(?:\[[^\]]*\])?\s*\{[^}]*\b(?:luacode|luatexja)\b)/.test(content) ? 'lualatex' : /\\(?:set(?:CJK)?mainfont|usepackage\s*(?:\[[^\]]*\])?\s*\{[^}]*\b(?:fontspec|xeCJK|xltxtra|xunicode)\b)/.test(content) ? 'xelatex' : 'pdflatex');
    return {path:file.path,engine,complete:/\\documentclass\s*(?:\[[^\]]*\])?\s*\{/.test(content)};
  }).filter(file => file.complete).sort((a,b) => Number(b.path==='main.tex')-Number(a.path==='main.tex') || a.path.split('/').length-b.path.split('/').length || Number(b.path.split('/').at(-1)==='main.tex')-Number(a.path.split('/').at(-1)==='main.tex') || a.path.localeCompare(b.path));
}

export function matchingBuild(build, project) {
  return build && project && build.project===project.id && build.root===project.root && build.engine===project.engine ? build : null;
}
