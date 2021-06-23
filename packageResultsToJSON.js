
// Have the Viz open a directory which has all of the results files and source files.
// Should have the directory structure so that files can be read.

import * as fs from 'fs';
import * as path from 'path';
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers';
import { exit } from 'process';

// YARG testing
const argv = yargs(hideBin(process.argv)).argv

let resFile = argv.resFile;
let pathTo = argv.pathTo;

if (!resFile || !pathTo) {
  console.log("ERROR. Usage...");
  exit(1);
}

/*
  Generally useful functions.
*/

function getSourceForLocation(loc) {
  // Parse loc to get the a) file name, and b) location of the relevant bit.
  // Example: (sequential.js:5:9:5:23)
  // Split on 1st ":".
  let pos = loc.indexOf(":");
  // Slicing from 1 b/c we want to get rid of opening "(".
  let filePath = loc.slice(1, pos);
  // Slicing up to len - 1 b/c we want to get rid of closing ")".
  let indexInFile = loc.slice(pos+1, loc.length - 1);

  // There are three more indices in the name.
  let r1, r2, c1, c2;
  let i = 0;

  let indexOfStart = 0;
  let indexOfEnd = 0;

  for (; i < 3; i ++) {
    pos = indexInFile.indexOf(":");
    if (i == 0) {
      r1 = Number(indexInFile.slice(0, pos));
      indexInFile = indexInFile.slice(pos+1, indexInFile.length);
    } else if (i == 1) {
      c1 = Number(indexInFile.slice(0, pos));
      indexInFile = indexInFile.slice(pos+1, indexInFile.length);
    } else {
      r2 = Number(indexInFile.slice(0, pos));
      c2 = Number(indexInFile.slice(pos+1, indexInFile.length));
    }
  }

  r1 -= 1;
  r2 -= 1;

  // Find row, then column:
  let theSource = fs.readFileSync(filePath, 'utf8');
  let theChar = "";
  let rowsToGo = r1;
  for (i = 0; i < theSource.length; i++) {
    theChar = theSource[i];

    if (rowsToGo == 0) {
      // We found the start row.
      // Find start column.
      i += c1;
      break;
    }

    if (rowsToGo == 3) {
      indexOfStart = i;
    }

    if (theChar == "\n") {
      rowsToGo--;
    }
  }

  rowsToGo = r2 - r1;
  let start = i;
  let j = i;

  if (r1 == r2) {
    j = start + c2 - c1;
  } else {
    for (; j < theSource.length; j++) {
      theChar = theSource[j];

      if (rowsToGo == 0) {
          j += c2;
          break;
      }

      if (theChar == "\n") {
        rowsToGo--;
      }
    }
  }

  // build indexOfEnd
  // go and grab 2 more rows.
  let grabMe = 4;
  let z = j;
  for (; z < theSource.length; z++) {
    theChar = theSource[z];
    if (theChar == "\n")
      grabMe--;
    if (grabMe == 0) {
      break;
    }
    indexOfEnd = z;
  }

  // Move r1 and r2 up by one, cause of starting at line 1 not line 0.
  r1++;
  r2++;

  return { theSource: theSource.slice(indexOfStart, indexOfEnd), 
           startLine: r1,
           startCol:  c1,
           endLine:   r2,
           endCol:    c2 };
}

// Workhorse function.
function processResFile(file) {
  let fileContents = {};
  console.log('Processing: ' + path.join(pathTo, file));
  let contents = JSON.parse(fs.readFileSync(path.join(pathTo, file)));
  let userCodeAsyncIds = [];
  let sourceFilePaths = new Map();
  
  // First, make a new object with asyncIds mapping to promises.
  let asyncIdMap = {};
  for (let key in contents.promises) {
    let entry = contents.promises[key];
    asyncIdMap[entry.asyncId] = entry;
  }

  for (let key in contents.promises) {
    let entry = contents.promises[key];

    /* Initialize fields on the JSON */
    entry.line = "<promise not in user code>";
    entry.startLine = 0;
    entry.startCol =  0;
    entry.endLine =   0;
    entry.endCol =    0;
    entry.file =     '';

    // To keep track of which ops are triggered by this promise.
    if (!entry.triggers) {
      entry.triggers = [];
    }

    // The promise that triggered this one is known to us.
    if (asyncIdMap[entry.triggerAsyncId]) {
      if (!asyncIdMap[entry.triggerAsyncId].triggers) {
        asyncIdMap[entry.triggerAsyncId].triggers = [];
      }
  
      asyncIdMap[entry.triggerAsyncId].triggers.push(entry.asyncId);
    }

    // Only update stuff that's from the target dir.
    if (entry.source.indexOf(pathTo) == -1) {
      continue;
    }

    let sourcePath = entry.source.substring(1, entry.source.indexOf(':'));
    if (fs.existsSync(sourcePath)) {
      // Get the line from the file, and include it in the .json as a preview.
      let snippetAndRC = getSourceForLocation(entry.source);
      entry.line = snippetAndRC.theSource;
      entry.startLine = snippetAndRC.startLine;
      entry.startCol =   snippetAndRC.startCol;
      entry.endLine =     snippetAndRC.endLine;
      entry.endCol =       snippetAndRC.endCol;

      // TODO: add paths to array, cross-ref with user promises later.
      // let theseContents = fs.readFileSync(sourcePath, 'utf8');
      // Update the source, removing absolute path to the files, making them relative to project root.
      if (sourcePath.indexOf(pathTo) != -1) {
        // Add it to the list of potential sources.
        entry.source = entry.source.substring(1 + pathTo.length, entry.source.length - 1);
        // fileContents[entry.source.substring(0, entry.source.indexOf(':'))] = theseContents;
        entry.file = entry.source.substring(0, entry.source.indexOf(':'));
        sourceFilePaths.set(entry.file, sourcePath);
      }

      // Lastly, this promise is in user code, so we note it's asyncId.
      // Heuristic: ignore node_modules.
      if (sourcePath.indexOf('node_modules') == -1) {
        userCodeAsyncIds.push(entry.asyncId);
      }
    }
  }

  // Go over all user promises, and grab chains leading to and stemming from them.
  let userProximalPromises = new Set();
  userCodeAsyncIds.forEach(aid => {
    // Add the user promise.
    userProximalPromises.add(asyncIdMap[aid]);

    // Add all promises that triggered this one.
    let triggerAsyncId = asyncIdMap[aid].triggerAsyncId;
    while (asyncIdMap[triggerAsyncId]) {
      userProximalPromises.add(asyncIdMap[triggerAsyncId]);
      triggerAsyncId = asyncIdMap[asyncIdMap[triggerAsyncId].asyncId].triggerAsyncId;
    }

    // Add all triggered promises.
    // Note: weirdness here to copy array.
    let promisesToAdd = Array.from(asyncIdMap[aid].triggers);
    while (promisesToAdd.length > 0) {
      let triggered = promisesToAdd.pop();
      if (asyncIdMap[triggered]) {
        userProximalPromises.add(asyncIdMap[triggered]);
        // promisesToAdd = promisesToAdd.concat(asyncIdMap[triggered].triggers);
        // This makes and unmakes a set. Union of two arrays.
      	promisesToAdd = [...new Set([...asyncIdMap[triggered].triggers, ...promisesToAdd])]; 
      }
    }
  });

  // Post-process, removing (:0:0:0:0) sources, and stuff
  // starting with (internal/
  userProximalPromises.forEach(v => {
    if (v.source == '(:0:0:0:0)' || 
        (v.source.length >= 10 && 
         v.source.substring(0, 10) == '(internal/')) {
           userProximalPromises.delete(v);
         }
  });

  // Finally, go through userProximalPromises and fetch all associated files.
  // Only if they exist!
  // Also put them in a map.
  let tmpMap = new Map();
  userProximalPromises.forEach(v => {
    tmpMap.set(v.asyncId, v);
    if (fs.existsSync(v.file))
      fileContents[v.file] = fs.readFileSync(sourceFilePaths.get(v.file), 'utf8');
  });

  // Sort it.
  let userProximalPromisesArray = [];
  let ids = Array.from(tmpMap.keys());
  ids.sort((a, b) => a - b);
  let uid = 0;
  ids.forEach(v => {
    userProximalPromisesArray.push(tmpMap.get(v));
    userProximalPromisesArray[uid].uniqueid = uid;
    uid++;
  })

  // return it
  // return {promises: contents.promises, files: fileContents};
  return {promises: Object.assign({}, userProximalPromisesArray), files: fileContents};
}

function preprocessResFile(resFile) {
  let newFileString = '{\n"promises": {\n';

  let i = 0;
  let contents = fs.readFileSync(path.join(pathTo, resFile), 'utf-8');
  let lines = contents.split('\n');
  lines.forEach(l => {
    if (l != '') {
      let maybeComma = ',';
      if (i == lines.length - 2)
        maybeComma = '';
      newFileString += '"' + i + '": ' + l + maybeComma + '\n';
      i++;
    }
  });

  newFileString += '}\n}';
  fs.writeFileSync(path.join(pathTo, resFile + '-tmp'), newFileString);
}

// Pre-process the res file, as now we are moving to a "live analysis" mode which spits promises to a text file.
// TODO Improve this, but ATM let's just read the file in, and write it out in the correct format.
preprocessResFile(resFile);

let processed = processResFile(resFile + '-tmp');

// Delete the -tmp file.
fs.unlinkSync(resFile + '-tmp');

// Write the juicy processed file.
fs.writeFileSync(path.join(pathTo, 'processed-' + resFile), JSON.stringify(processed, null, 2));
