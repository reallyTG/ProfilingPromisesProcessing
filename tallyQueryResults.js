// Profiling Promises -- Collect the statistics for detected antipatterns.

// Requires.
import * as fs from 'fs';

// Read from this directory.
const READ_FROM = '/data/ProfilingPromises/QueryResults/findPromiseAntipatterns/';

// Header. Update as necessary.
let stat_string = 'project, pattern, count';

fs.readdir(READ_FROM, (e, files) => {

    if (e) {
        console.log(e);
    } else {
        // For each file.
        files.forEach(f => {
            const THIS_PATH = READ_FROM + f;

            const csv = fs.readFileSync(THIS_PATH, 'utf-8');

            // Initialize statsObj. Fields are built up dynamically for each pattern.
            let statsObj = { };
            csv.split('\n').filter(l => l.length > 0).forEach(l => {
                let processedLine = l.substr(1, l.length - 2); // Remove leading & trailing quotes.
                let splitLine = processedLine.split(' ');
                if (splitLine.length <= 1)
                    return;
                
                let pattern = splitLine[0]; // This will be the pattern string.
                // Initialize the field if it's undefined.
                statsObj[pattern] = statsObj[pattern] ? statsObj[pattern] + 1 : 1; 
            });

            for (let k of Object.keys(statsObj)) {
                stat_string += f + ', ' + k + ', ' + statsObj[k] + '\n';
            }
        });
    }

    fs.writeFileSync('/data/ProfilingPromises/Stats/antipatternStats.csv', stat_string);
});

// Done.