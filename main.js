const application = require("application");
const { editDocument } = require("application");
const {selection} = require("scenegraph");
const ImageFill = require("scenegraph").ImageFill;
// let scenegraph = require("scenegraph");
const fs = require('uxp').storage;
let panel;
let url = 'https://api.remove.bg/v1.0/removebg';
let primaryBtnLabel = 'Remove background';
let waitBtnLabel = 'Removing...';
let requestTimeout = 120000; // miliseconds

function create() {
    const HTML =
        `<style>
            #main {}
            #preview {display: flex; justify-content: center; align-items: center; width: 100%; overflow: hidden; border: 1px solid #ddd; background: #efefef;}
            #message {display: flex; justify-content: center; align-items: center; flex-direction: column; margin: 25px 15px; line-height: 150%;}
            #message img {width: 50px;}
            #images {display: none; max-width: 100%; overflow: hidden;}
            #images img {width: 100%;}
            #btn-primary {width: 100%;}
            #ourDialog {width: 300px; line-height: 150%;}
            #footer {width: 100%; position: fixed; bottom: 0; left: 0; line-height: 150%;}
            #footer a {color: #595959;}
        </style>
        <div id="main">
            <div id="preview">
                <div id="message">
                    <img src="images/placeholder.svg" /><br/>
                    <span>Select an image.</span>
                </div>
                <div id="images"></div>
            </div>
            <button id="btn-primary" type="submit" uxp-variant="cta" disabled>`+primaryBtnLabel+`</button>
        </div>
        <div id="footer">
            <ul>
                <li><h3><a href="#api-key" id="btn-api-key">Enter API Key</a></h3></li>
                <li><h3><a href="https://mighty.tools">Learn more</a></h3></li>
                <li><h3><a href="https://remove.bg">Remove.bg</a></h3></li>
            </ul>
        </div>
        `;

    panel = document.createElement("div");
    panel.innerHTML = HTML;

    panel.querySelector("#btn-primary").addEventListener("click", async function(){
        const btnPrimary = this;
        editDocument({ editLabel: "Remove Background" }, async function () {
            btnPrimary.setAttribute("disabled");
            btnPrimary.textContent = waitBtnLabel;
            let images = document.querySelector("#images");
            let postData = new FormData();
            postData.append('image_file_b64', images.children[0].src.match(/,(.*)$/)[1]);

            const finalImage = await removeBG(url, postData).catch(err => {
                showDialog(err, 300);
                btnPrimary.textContent = primaryBtnLabel;
                btnPrimary.removeAttribute("disabled");
            });
            if(finalImage !== undefined){
                const fill = new ImageFill(`data:image/png;base64,${finalImage}`);
                selection.items[0].fill = fill;
                selection.items = null; 
            }
            btnPrimary.textContent = primaryBtnLabel;
            btnPrimary.removeAttribute("disabled");
        });
    });

    panel.querySelector("#btn-api-key").addEventListener("click", async function(){
        let apiKey = window.localStorage.getItem('apiKey') ? window.localStorage.getItem('apiKey') : '';
        showDialog(`
            <form>
                <input name="apiKey" type="text" value="`+apiKey+`" placeholder="Enter API Key" maxlength="30" width="100%" />
            </form>
            <p>If you don't have an API key, get one from <a href="https://www.remove.bg">www.remove.bg</a>.</p>
        `, 300);
    });

    let ourDialog = document.createElement("dialog");
    ourDialog.setAttribute("id", "ourDialog");
    ourDialog.innerHTML = `<div id="body"></div><footer><button id="btnClose" uxp-variant="primary">Ok</button></footer>`;
    document.appendChild(ourDialog);
    
    return panel;
}

async function showDialog(body, size) {
    let ourDialog = document.querySelector("#ourDialog");
    document.querySelector("#ourDialog #body").innerHTML = body;
    document.querySelector("#ourDialog #btnClose").onclick = () => {
        if(document.getElementsByTagName("form")[0] !== undefined && document.getElementsByTagName("form")[0].children.length > 0){
            document.getElementsByTagName("form")[0].children.forEach(function (input) {
                window.localStorage.setItem(input.name, input.value);
            });
        }
        ourDialog.close();
    }
    if(size != null){
        ourDialog.style.width = size + "px";
    }
    await ourDialog.showModal();  
}

function show(event) {
    if (!panel) event.node.appendChild(create());
}

async function update() {
    const images = document.querySelector("#images");
    const message = document.querySelector("#message");
    const btnPrimary = panel.querySelector("#btn-primary");

    images.style.display = "none";
    message.style.display = "flex";

    while (images.firstChild) {
        images.removeChild(images.firstChild);
    }
    if (selection.items.length == 1 && selection.items[0].fill instanceof ImageFill) {
        const renditionsFiles = await createRenditions();
        const arrayBuffer = await renditionsFiles[0].read({ format: fs.formats.binary });
        const image = document.createElement("img");
        const base64 = base64ArrayBuffer(arrayBuffer);
        image.setAttribute("src", `data:image/png;base64,${base64}`);
        images.appendChild(image);
        images.style.display = "flex";
        message.style.display = "none";
        btnPrimary.removeAttribute("disabled");
    }else{
        btnPrimary.setAttribute("disabled");
    }
    
}

function removeBG(url, postData) {
    return new Promise((resolve, reject) => {
        let xhr = new XMLHttpRequest();
        // console.log("request");
        xhr.onload = () => {
            if (xhr.status === 200) {
                // console.log("200");
                try {
                    // console.log("resolving");
                    resolve(xhr.response.data.result_b64);
                }catch (err) {
                    reject(`Couldn't parse response. ${err.message}, ${xhr.response}`);
                }
            }else if(xhr.status === 400){
                reject('This image is too complex for the AI to process. Try using a smaller image of person, animal or product.<br/><br/>Go to <a href="https://www.remove.bg">www.remove.bg</a> to learn more.');
            }else if(xhr.status === 402){
                reject('Insufficient credits. Go to <a href="https://www.remove.bg">www.remove.bg</a> and buy more.');
            }else if(xhr.status === 403){
                reject('Authentication failed. Make sure you have entered a valid API key. <br/><br/> There is "Enter API Key" button at the bottom of the plugin\'s panel.');
            }else{
                reject(`${xhr.response.errors[0].title} Error code ${xhr.status}.`);
            }
        }
        xhr.ontimeout = () => {
            reject(`The server couldn't process your request in a timely manner and it was terminated. Waited for ${requestTimeout/1000} seconds.`);
        };
        xhr.onerror = () => {
            reject(`Network request failed.`);
        };
        xhr.onabort = () => {
            reject(`Network request was aborted.`);
        };
        xhr.open('POST', url, true);
        xhr.responseType = "json";
        xhr.timeout = requestTimeout;
        xhr.setRequestHeader('X-Api-Key', window.localStorage.getItem('apiKey'));
        xhr.setRequestHeader('Accept', 'application/json'); 
        xhr.send(postData);
    });
}

async function createRenditions() {
    const folder = await fs.localFileSystem.getTemporaryFolder();
    let arr = [];
    for(var i = 0; i < selection.items.length; i++){
        await folder.createFile(`${selection.items[i].guid}.png`, { overwrite: true }).then(file => {
            let obj = {};
            obj.node = selection.items[i];
            obj.outputFile = file;
            obj.type = "png";
            obj.scale = 1;
            arr.push(obj);
        });
    }
    const renditionResults = await application.createRenditions(arr);
    const renditionsFiles = renditionResults.map(a => a.outputFile);
    return renditionsFiles;
}

function base64ArrayBuffer(arrayBuffer) {
    let base64 = ''
    const encodings = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

    const bytes = new Uint8Array(arrayBuffer)
    const byteLength = bytes.byteLength
    const byteRemainder = byteLength % 3
    const mainLength = byteLength - byteRemainder

    let a, b, c, d
    let chunk

    // Main loop deals with bytes in chunks of 3
    for (var i = 0; i < mainLength; i = i + 3) {
        // Combine the three bytes into a single integer
        chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]

        // Use bitmasks to extract 6-bit segments from the triplet
        a = (chunk & 16515072) >> 18 // 16515072 = (2^6 - 1) << 18
        b = (chunk & 258048) >> 12 // 258048   = (2^6 - 1) << 12
        c = (chunk & 4032) >> 6 // 4032     = (2^6 - 1) << 6
        d = chunk & 63               // 63       = 2^6 - 1

        // Convert the raw binary segments to the appropriate ASCII encoding
        base64 += encodings[a] + encodings[b] + encodings[c] + encodings[d]
    }

    // Deal with the remaining bytes and padding
    if (byteRemainder == 1) {
        chunk = bytes[mainLength]

        a = (chunk & 252) >> 2 // 252 = (2^6 - 1) << 2

        // Set the 4 least significant bits to zero
        b = (chunk & 3) << 4 // 3   = 2^2 - 1

        base64 += encodings[a] + encodings[b] + '=='
    } else if (byteRemainder == 2) {
        chunk = (bytes[mainLength] << 8) | bytes[mainLength + 1]

        a = (chunk & 64512) >> 10 // 64512 = (2^6 - 1) << 10
        b = (chunk & 1008) >> 4 // 1008  = (2^6 - 1) << 4

        // Set the 2 least significant bits to zero
        c = (chunk & 15) << 2 // 15    = 2^4 - 1

        base64 += encodings[a] + encodings[b] + encodings[c] + '='
    }

    return base64
}

module.exports = {
    panels: {
        removebg: {
            show,
            update
        }
    }
};
