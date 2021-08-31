
// Have the Viz open a directory which has all of the results files and source files.
// Should have the directory structure so that files can be read.

import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';

/*
  Generally useful functions.
*/

function getSourceForLocation(loc, pathToFile, nameOfProject) {
  // Parse loc to get the a) file name, and b) location of the relevant bit.
  // Example: (sequential.js:5:9:5:23)
  // Split on 1st ":".
  let pos = loc.indexOf(":");
  // Slicing from 1 b/c we want to get rid of opening "(".
  let filePath = loc.slice(0, pos);
  // Remove the name of the root proj dir.
  // TODO: Or remove it from the .json?
  filePath = filePath.substring(nameOfProject.length + 1);
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
  let theSource = fs.readFileSync(path.join(pathToFile, filePath), 'utf8');
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

  // console.log(loc);
  // console.log("indexOfStart: " + indexOfStart);
  // console.log("indexOfEnd: " + indexOfEnd);
  // console.log(theSource.slice(indexOfStart, indexOfEnd));

  // This is the source that we want to highlight.
  // let sourceToHighlight = theSource.slice(start - 1, j);

  // return {theSource: theSource,
  //         lineRange: r1 + "-" + r2};
  return theSource.slice(indexOfStart, indexOfEnd)
}

let listOfSourceFiles = [];

let pathToProj = process.argv[3]; 
if (!pathToProj) {
    console.log("Usage: node packageResults.js <project-name> <path-to-project>");
    process.exit(1);
}

let projectName = process.argv[2]; 
if (!projectName) {
    console.log("Usage: node packageResults.js <project-name> <path-to-project>");
    process.exit(1);
}

console.log('Listing source files...');

// Get all source files.
function traverseDir(dir) {
  fs.readdirSync(dir).forEach(file => {
    let fullPath = path.join(dir, file);
    if (fs.lstatSync(fullPath).isDirectory()) {
        traverseDir(fullPath);
      } else {
        if (path.extname(fullPath) == ".js")
          listOfSourceFiles.push(fullPath);
      } 
  });
}

traverseDir(pathToProj);


// Get the line (+/- 3) and put it in the .json files.
// While you're at it, remove absolute paths.
function processResFile(file) {
  console.log('Processing: ' + path.join(pathToProj, file));
  let contents = JSON.parse(fs.readFileSync(path.join(pathToProj, file)));
  for (let key in contents.promises) {
    let entry = contents.promises[key];
    entry.line = "<promise not in user code>";

    // Only update stuff that's from the target dir.
    if (entry.source.indexOf(projectName) == -1) {
      continue;
    }

    // Update the source, removing absolute path to the files, making them relative to project root.
    entry.source = entry.source.substr(entry.source.indexOf(projectName));

    // Get the line from the file, and include it in the .json as a preview.
    // Pass pathToProj to create a usable path (as paths have just been normalized.)
    entry.line = getSourceForLocation(entry.source, pathToProj, projectName);
  }
  // contents is now modified, rewrite it.
  fs.writeFileSync(path.join(pathToProj, file), JSON.stringify(contents, null, 2));
}

let resultFileNames = [];

console.log('Processing .json result files...');

// Get all of the JSON files.
fs.readdirSync(pathToProj).forEach(file => {
  if (path.extname(file) == ".json" && file.substring(0, 7) == "results") {
    processResFile(file);
    resultFileNames.push(path.join(pathToProj, file));
  }
})

/*
    Archiver, package everything up.
*/

console.log('Initializing archiver...');

let outputDirName = 'processed-results';
const output = fs.createWriteStream(path.join(outputDirName, projectName + '-archive.zip'));
const archive = archiver('zip', {
  zlib: { level: 9 } // All of the compression.
});

output.on('close', function() {
  console.log('Archive complete.')
  console.log(archive.pointer() + ' total bytes');
});

archive.on('warning', function(err) {
  if (err.code === 'ENOENT') {
    console.warn("Warning triggered.");
  } else {
    // throw error
    throw err;
  }
});
 
// good practice to catch this error explicitly
archive.on('error', function(err) {
  throw err;
});

// pipe archive data to the file
archive.pipe(output);

console.log('Moving files to temporary directory...');
let tmpName = projectName + '-archive';
fs.mkdirSync(tmpName);
fs.mkdirSync(tmpName + "/" + projectName);
tmpName = tmpName + "/" + projectName; // update cause were putting an extra dir
let processTheseFiles = resultFileNames.concat(listOfSourceFiles);
for (let k in processTheseFiles) {
  let f = processTheseFiles[k];
  let pathLocalToProjRoot = f.substring(f.indexOf(pathToProj) + pathToProj.length);
  let newPath = path.join(tmpName, pathLocalToProjRoot);
  fs.mkdirSync(path.dirname(newPath), { recursive: true });
  fs.copyFileSync(f, newPath);
}

console.log('Archiving...');
archive.directory(tmpName);
// This doesn't work.
// Put files in.
// let processTheseFiles = resultFileNames.concat(listOfSourceFiles);
// for (let k in processTheseFiles) {
//   let f = processTheseFiles[k];
//   console.log('Archiving: ' + f);
//   archive.append(fs.createReadStream(f), { name: path.basename(f) });
// }

archive.finalize();