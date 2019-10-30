const userCertGenerator = require('aws-sap-user-cert-generator')
const request = require("request")

const allowedHeadersInToSAP = ["accept", "accept-language", "dataserviceversion", "maxdataserviceversion", "content-type", "x-csrf-token", "cookie"]

/*-------------------------------------------------------------------*/
// Main entry
/*-------------------------------------------------------------------*/
exports.handler = async (event, context) => {
    var response = {
        isBase64Encoded: false,
        statusCode: 200,
        headers: {},
        body: {}
    }
    var responsebody = {}

    try {
        var config = {}
        config.DDBForCerts = process.env.DDB_FOR_CERTS
        config.certExpiryInDays = process.env.CERT_EXPIRY_IN_DAYS
        config.certPassSecret = process.env.CERT_PASS_SECRET

        if (process.env.FORCE_CREATE_NEW_USER_CERT && process.env.FORCE_CREATE_NEW_USER_CERT.toLowerCase() === "true") {
            config.forceCreateNewUserCert = true
        }
        if (process.env.WRITE_CONSOLE_LOG && process.env.WRITE_CONSOLE_LOG.toLowerCase() === "true") {
            config.writeConsoleLog = true
        }
        config.userId = getUserId(event)
        userCertGenerator.loadConfig(config)
        var userCertJson = await userCertGenerator.generateCert()
        response.body = JSON.stringify(await callSAP(event, userCertJson.payload))
    } catch (functionError) {
        console.log("function error", functionError)
        var erroMesssage = 'Unknown error. Check Console Log'
        if (functionError.message) {
            erroMesssage = functionError.message
        }
        response.body = erroMesssage
    }
    response = allowOriginHeader(response)
    return response
}

/*-------------------------------------------------------------------*/
// Get the user ID
/*-------------------------------------------------------------------*/
function getUserId(event) {
    var userid = ""
    if (!userid || userid == null || userid == "") {
        try {
            userid = event.requestContext.authorizer.claims.identities.userId
        } catch (e) {}
    }
    if (!userid || userid == null || userid == "") {
        try {
            userid = event.requestContext.authorizer.claims["cognito:username"]
        } catch (e) {}
    }
    if (!userid || userid == null || userid == "") {
        try {
            var userid = event.requestContext.identity.userArn.split(':')[5]
            userid = userid.replace('user/', "").toUpperCase()
        } catch (e) {}
    }
    if (!userid || userid == null || userid == "") {
        try {
            userid = event.sapdemo.userid
        } catch (e) {}
    }

    if (!userid || userid == null || userid == "") {
        throw new Error("Unknown User ID")
    }
    return userid
}

/*-------------------------------------------------------------------*/
// Call SAP
/*-------------------------------------------------------------------*/
function callSAP(event, userCertJson) {
    return new Promise(function (resolve, reject) {
        var options = {}
        options.uri = 'https://' + process.env.SAP_HOST + ':' + process.env.SAP_PORT + event.path
        options.method = event.httpMethod
        options.qs = event.queryStringParameters

        var headers = JSON.parse(JSON.stringify(event.headers))
        headers = filterAllowedHeaders(headers, allowedHeadersInToSAP)
        options.headers = headers
        if (options.headers['content-type'] == 'application/json') {
            options.json = true
        }
        options.headers['accept-encoding'] = 'deflate br'
        options.cert = Buffer.from(userCertJson.cert, 'base64')
        options.key = Buffer.from(userCertJson.key, 'base64')
        options.passphrase = userCertJson.userKeyPass
        options.ca = Buffer.from(userCertJson.serverCert, 'base64')
        if (event.body) {
            if (options.json) {
                options.body = JSON.parse(event.body)
            } else {
                options.body = event.body
            }
        }
        options.jar = true
        if (process.env.REJECT_SELF_SIGNED_CERTS && process.env.REJECT_SELF_SIGNED_CERTS.toLowerCase() === "false") {
            options.strictSSL = true
        } else {
            options.strictSSL = false
        }

        request(options, (error, resp, body) => {
            var response = {}
            response.statusCode = resp.statusCode
            response.headers = resp.headers
            if (error) {
                console.log('Error! ', error)
                var errorMessage = JSON.stringify(error)
                if (error.message) {
                    errorMessage = error.message
                }
                response.body = errorMessage
                resolve(response)
            } else {
                response.body = body
                resolve(response)
            }
        })
    })
}

/*-------------------------------------------------------------------*/
// Get the user ID
/*-------------------------------------------------------------------*/
function allowOriginHeader(response) {
    response.headers = {
        "Access-Control-Allow-Origin": "*"
    }
    return response
}

/*-------------------------------------------------------------------*/
// Get the user ID
/*-------------------------------------------------------------------*/
function filterAllowedHeaders(headers, allowedHeaders) {
    for (var prop in headers) {
        var _prop = prop.toLowerCase()
        if (!allowedHeaders.includes(_prop)) {
            delete headers[prop]
        }
    }
    return headers
}