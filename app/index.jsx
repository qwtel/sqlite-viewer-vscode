import React from 'react';
import ReactDOM from 'react-dom';
import { useTable } from 'react-table'

// import { default as initSqlJs }  from 'sql.js';

const vscode = acquireVsCodeApi();

// const SQL = await initSqlJs({
//   // Required to load the wasm binary asynchronously. Of course, you can host it wherever you want
//   // You can omit locateFile completely when running in node
//   locateFile: file => `https://sql.js.org/dist/${file}`
// });

ReactDOM.render(
  <h1>Hello, world!</h1>,
  document.getElementById('root')
);


// Handle messages from the extension
window.addEventListener('message', async e => {
    const { type, body, requestId } = e.data;
    switch (type) {
        case 'init': {
            // editor.setEditable(body.editable);
            if (body.untitled) {
                // await editor.resetUntitled();
                return;
            } else {
                // Load the initial image into the canvas.
                const data = new Uint8Array(body.value.data);
                // loadDB(data.buffer);
                console.log(data);
                return;
            }
        }
        case 'update': {
            // TODO
            // const data = body.content ? new Uint8Array(body.content.data) : undefined;
            // if (data) {
            //   loadDB(data.buffer);
            // }
            return;
        }
        case 'getFileData': {
            // vscode.postMessage({ type: 'response', requestId, body: Array.from(db.export()) });
            return;
        }
    }
});

// Signal to VS Code that the webview is initialized.
vscode.postMessage({ type: 'ready' });
