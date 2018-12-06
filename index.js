let Airtable = require('airtable')
let OxfordDictionary = require('oxford-dictionary-api')
require('dotenv').config()
// rate(1 minute)
// ap-southeast-2
// aws lambda update-function-code --function-name lambdaFunction --zip-file fileb://${PWD}/lambdaFunction.zip

// keys
let API_KEY = process.env.REACT_APP_AIRTABLE_API_KEY
let OXFORD_KEY = process.env.REACT_APP_OXFORD_API_KEY

// oxford api setup
let app_id = "840007e3";
let oxford = new OxfordDictionary(app_id, OXFORD_KEY);

// storage for wordsToSearch
let wordsToSearchArr = []
let wordsToSearchObjs = []

// new definitions storage
let updatedDefinitions = []

Airtable.configure({apiKey: API_KEY, endpointUrl: 'https://api.airtable.com'})

// airtable base
let dictionaryBase = new Airtable({apiKey: API_KEY}).base('appHNmzsbpQLZtgte');

removeDuplicates = (array, prop) => {
  return array.filter((obj, pos, arr) => {
    return arr.map(mapObj => mapObj[prop]).indexOf(obj[prop]) === pos;
  });
}

wts = () => {
  // select all wordsToSearch missing definitions
  dictionaryBase('Words to Search copy').select({view: "Grid view", filterByFormula: `NOT(Definition = BLANK()) = 0`}).eachPage(function page(records, fetchNextPage) {

    // store words & word objs missing defs. in arrays
    records.forEach(function(record) {
      // if record is already stored (duplicate) delete in table
      if (wordsToSearchArr.indexOf(record.get('Word')) === -1) {
        let wordObj = {
          word: record.get('Word'),
          definition: record.get('Definition'),
          recordId: record.get('record id')
        }
        wordsToSearchObjs.push(wordObj);
        wordsToSearchArr.push(record.get('Word'))
      } else {
        dictionaryBase('Words to Search copy').destroy(record.get('record id'), function(err, deletedRecord) {
          if (err) {
            console.error(err);
            return;
          }
        });
      }
    })

    fetchNextPage()

  }, async function done(err) {
    if (err) {
      console.error(err);
      return;
    }
    wordsToSearchObjs = wordsToSearchObjs.slice(0, 4)
    // end of airtable base call, all objects populated to use here with no duplicates :)
    // Now, find all oxford definitions for these words HERE
    for (wordObj of wordsToSearchObjs) {
      await searchOxford(wordObj, handleNewDefinition)
    }

    // return wordsToSearchObjs
  }) // end wts airtable base call here

}

searchOxford = (wordObj, cb) => {

  oxford.find(encodeURI(wordObj.word), function(error, data) {
    let definition
    if (error) {
      // return console.error;(error);

      // set definition to no definition found (error)
      definition = 'No definition found'
      // set definition here
      wordObj['definition'] = definition
    } else {
      // lots of repetition to check if any parts of data are undefined from oxford response
      if (data !== undefined) {
        if (data.results !== undefined) {
          if (data.results[0] !== undefined) {
            if (data.results[0].lexicalEntries[0] !== undefined) {
              if (data.results[0].lexicalEntries[0].entries[0] !== undefined) {
                if (data.results[0].lexicalEntries[0].entries[0].senses[0] !== undefined) {
                  if (data.results[0].lexicalEntries[0].entries[0].senses[0].definitions !== undefined) {
                    // SET DEFINITION TO OXFORD RESULT OR...
                    definition = data.results[0].lexicalEntries[0].entries[0].senses[0].definitions[0]
                    // set definition here
                    wordObj['definition'] = definition
                  } else {
                    // SET DEFINITION TO NOT FOUND
                    definition = 'No definition found'
                    // set definition here
                    wordObj['definition'] = definition
                  }
                }
              }
            }
          }
        }
      }
      // end if checks
    }

    cb(wordObj, updateAirtableDefinitions)
  }) // end oxford call here DEFINITION CONTAINED IN OBJECT HERE
}

// pass new definitions to array, if length matches wts length then pass the updated definitions to oxf defs table
handleNewDefinition = (wordObj, cb) => {
  // word obj exists here o.O
  updatedDefinitions.push(wordObj)
  if (updatedDefinitions.length === wordsToSearchObjs.length) {
    cb(updatedDefinitions)
  }
}

// update oxford definitions in airtable
updateAirtableDefinitions = (updatedDefinitions) => {

  let oxfordDefinitions = []
  dictionaryBase('Oxford Definitions copy').select({view: "Grid view"}).eachPage(function page(records, fetchNextPage) {

    records.forEach(function(record) {
      oxfordDefinitions.push(record.get('Word'))
    });
    fetchNextPage();

  }, function done(err) {
    if (err) {
      console.error(err);
      return;
    }
    for (newDef of updatedDefinitions) {
      // check that word does not already exist in oxford table
      if (oxfordDefinitions.indexOf(newDef.word) === -1) {
        dictionaryBase('Oxford Definitions copy').create({
          "Word": newDef.word,
          "Definition": newDef.definition
        }, function done(err) {
          if (err) {
            console.error(err);
            return;
          }
        }) // end oxf airtable call here
        // if no definition, create empty def. record in mryum defs.
        if (newDef.definition === 'No definition found') {
          dictionaryBase('Mr Yum Definitions copy').create({
            "Word": newDef.word
          }, function done(err) {
            if (err) {
              console.error(err);
              return;
            }
          }) // if defintion exists, update wts with oxf definition  end mryum airtable call here
        } else {
          dictionaryBase('Words to Search copy').update(newDef.recordId, {
            "Definition": newDef.definition
          }, function done(err) {
            if (err) {
              console.error(err);
              return;
            }
          }) // end wts update airtable call here
        }
      }
    }
    // update wts table with mryum 'custom' definitions
    let mrYumWords = []
    let mrYumDefs = []
    dictionaryBase('Mr Yum Definitions copy').select({
      view: "Grid view",
      filterByFormula: `NOT(Definition = BLANK()) = 1`
    }).eachPage(function page(records, fetchNextPage) {

      records.forEach(function(record) {
        mrYumWords.push(record.get('Word'))
        mrYumDefs.push(record.fields)
      });

      fetchNextPage();

    }, function done(err) {
      if (err) {
        console.error(err);
        return;
      }
      // mryumdefs now contains all objects containing definitions
      for (updatedDefinition of updatedDefinitions) {
        if (mrYumWords.indexOf(updatedDefinition.word) !== -1) {
          // update wts with the defs
          let index = mrYumWords.indexOf(updatedDefinition.word)

          dictionaryBase('Words to Search copy').update(updatedDefinition.recordId, {
            "Definition": mrYumDefs[index]['Definition']
          }, function(err, record) {
              if (err) { console.error(err); return; }
          });
        }
      }
    });
  });
}

exports.handler = () => {

  wts()
};

exports.handler()
