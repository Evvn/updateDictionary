let OxfordDictionary = require('oxford-dictionary-api')
require('dotenv').config()

let OXFORD_KEY = process.env.REACT_APP_OXFORD_API_KEY

// oxford api setup
let app_id = "840007e3";
let oxford = new OxfordDictionary(app_id, OXFORD_KEY);

oxford.find('melon', function(error, data) {
  if (error) {
    definition = error
  } else {
    return data
  }
})
