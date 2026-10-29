import test from 'node:test';
import assert from 'node:assert/strict';
import {documentCandidates,matchingBuild} from '../shared/documents.mjs';

test('document detection excludes fragments and commented examples, preferring a complete main document',()=>{
 const files=[
  {path:'sections/intro.tex',content:'% \\documentclass{article}\n\\section{Introduction}'},
  {path:'main.tex',content:'\\input{meeting}'},
  {path:'meeting.tex',content:'\\documentclass{article}\n\\usepackage{fontspec,xeCJK}'},
  {path:'nested/main.tex',content:'\\documentclass{article}\n\\usepackage{luatexja}'}
 ];
 assert.deepEqual(documentCandidates(files).map(f=>[f.path,f.engine]),[['meeting.tex','xelatex'],['nested/main.tex','lualatex']]);
});

test('compiler detection respects TeX directives and Unicode font packages',()=>{
 for(const [preamble,engine] of [
  ['% !TeX program = LuaLaTeX\n\\usepackage{fontspec}','lualatex'],
  ['\\usepackage[options]{geometry,fontspec}','xelatex'],
  ['\\setCJKmainfont{Noto Sans CJK KR}','xelatex'],
  ['% \\usepackage{fontspec}\n\\usepackage{geometry}','pdflatex']
 ])assert.equal(documentCandidates([{path:'main.tex',content:'\\documentclass{article}\n'+preamble}])[0].engine,engine);
});

test('PDF preview only shows a build for the current project, main document and engine',()=>{
 const project={id:'project',root:'meeting.tex',engine:'xelatex'},build={project:'project',root:'meeting.tex',engine:'xelatex',pdfUrl:'/pdf'};
 assert.equal(matchingBuild(build,project),build);
 for(const change of [{id:'another'},{root:'main.tex'},{engine:'pdflatex'}])assert.equal(matchingBuild(build,{...project,...change}),null);
 assert.equal(matchingBuild(null,project),null);
});
