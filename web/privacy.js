import { DeliveryMethod } from "@shopify/shopify-api";
import axios from 'axios';
import shopify from './shopify.js';
import { gql } from 'graphql-tag';
import { GraphQLClient } from 'graphql-request';

/**
 * @type {{[key: string]: import("@shopify/shopify-api").WebhookHandler}}
 */
export default {

  CUSTOMERS_DATA_REQUEST: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: "/api/webhooks",
    callback: async (topic, shop, body, webhookId) => {
      const payload = JSON.parse(body);
    },
  },

  CUSTOMERS_REDACT: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: "/api/webhooks",
    callback: async (topic, shop, body, webhookId) => {
      const payload = JSON.parse(body);
    },
  },

  SHOP_REDACT: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: "/api/webhooks",
    callback: async (topic, shop, body, webhookId) => {
      const payload = JSON.parse(body);
    },
  },

  PRODUCTS_CREATE: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: "/api/webhooks",
    callback: async (topic, shop, body, webhookId) => {
      const payload = JSON.parse(body);
    }
  },
  CUSTOMERS_CREATE: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: "/api/webhooks",
    callback: async (topic, shop, body, webhookId) => {
      const payload = JSON.parse(body);
      console.log('Customer Creation Payload: ', payload);

      //console.log('Shopify: ', shopify);

      const session = await getSession(shop);
      const sessionAccessToken = session.accessToken;
      //console.log('Session Storage: ', session);
      //console.log('Session Shop: ', session.shop);
      //console.log('Session access token: ', sessionAccessToken);

      // Retrieve the RecordTypeId for Person Account
      const recordTypeId = await getPersonAccountRecordTypeId(shop, sessionAccessToken);
      const accountData = {
        FirstName: payload.first_name,
        LastName: payload.last_name,
        PersonEmail: payload.email,
        Phone: payload.phone,
        RecordTypeId: recordTypeId,
        OMSQS_Shopify_Customer_Id__c: payload.id
      };

      try {
        const result = await createAccount(accountData, shop, sessionAccessToken);
        console.log('Salesforce Account Created: ', result);
      } catch (error) {
        console.error('Error creating Salesforce account: ', error.response ? error.response.data : error.message);
      }
    }
  },
  ORDERS_CREATE: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: "/api/webhooks",
    callback: async (topic, shop, body, webhookId) => {
      const payload = JSON.parse(body);
      console.log('Order Creation Payload: ', payload);
      const orderCustomer = payload.customer;
      //console.log('Order Creation Customer Payload: ', orderCustomer);
      const orderLineItems = payload.line_items;
      //console.log('Order Line Itmes: ', orderLineItems);
      const billingAddress = payload.billing_address;
      console.log("Billing Address: ", billingAddress);
      const shippingAddress = payload.shipping_address;
      console.log("Billing Address: ", billingAddress);
      const orderShippingLineItem = payload.shipping_lines;

      let billingStateCode;
      let shippingStateCode;

      let shopName = shop.split('.myshopify.com')[0];
      console.log('Shop Name: ', shopName);

      if(billingAddress.province_code == 'TS') {
        billingStateCode = 'TG'
      } else {
        billingStateCode = billingAddress.province_code
      }
      if(shippingAddress.province_code == 'TS') {
        shippingStateCode = 'TG'
      } else {
        shippingStateCode = shippingAddress.province_code
      }

      const session = await getSession(shop);
      const sessionAccessToken = session.accessToken;

      let accountId = '';
      // Check whether the Customer Exist
      const queryCustomer = await checkCustomerExist(orderCustomer.id, shop, sessionAccessToken);
      const pricebookId = await getPricebookId(shop, sessionAccessToken);
      if (queryCustomer == 'New Customer') {
        // Retrieve the RecordTypeId for Person Account
        const recordTypeId = await getPersonAccountRecordTypeId(shop, sessionAccessToken);
        const accountData = {
          FirstName: orderCustomer.first_name,
          LastName: orderCustomer.last_name,
          PersonEmail: orderCustomer.email,
          Phone: orderCustomer.phone,
          RecordTypeId: recordTypeId,
          OMSQS_Shopify_Customer_Id__c: orderCustomer.id
        };
        try {
          const result = await createAccount(accountData, shop, sessionAccessToken);
          accountId = result;
          console.log('Salesforce Order Related Account Created: ', result);
        } catch (error) {
          console.error('Error creating Salesforce account: ', error.response ? error.response.data : error.message);
        }
      } else {
        accountId = queryCustomer;
      }
      const orderData = {
        AccountId: accountId,
        EffectiveDate: new Date(),
        Status: 'Draft',
        Pricebook2Id: pricebookId,
        OMSQS_Shopify_Id__c: payload.id,
        OMSQS_Shopify_Order_Number__c: payload.order_number,
        OMSQS_Shipping_Method__c: orderShippingLineItem[0].code,
        OMSQS_Shopify_Store_Name__c: shopName,
        BillingCountryCode: billingAddress.country_code,
        BillingStateCode: billingStateCode,
        BillingCity: billingAddress.city,
        BillingStreet: billingAddress.address1,
        BillingPostalCode: billingAddress.zip,
        ShippingCountryCode: shippingAddress.country_code,
        ShippingStateCode: shippingStateCode,
        ShippingCity: shippingAddress.city,
        ShippingStreet: shippingAddress.address1,
        ShippingPostalCode: shippingAddress.zip,

      };
      console.log('Order Data: ', orderData);
      try {
        const createOrd = await createOrder(orderData, shop, sessionAccessToken);
        const salesforceOrderId = createOrd;
        let isShippingLineItem = false;
        console.log('Salesforce Order Created: ', salesforceOrderId);
        if (salesforceOrderId != '') {
          try {
            const createOrdLineItems = await createOrderLineItems(salesforceOrderId,pricebookId,orderLineItems,shop,sessionAccessToken,isShippingLineItem);
            //console.log('Salesforce Order Line Items Created Successfully.');
          } catch (error) {
            console.log('Error creating Salesforce Order Line Items: ', error.response ? error.response.data : error.message);
          }
          try {
            isShippingLineItem = true;
            const createOrdShippingLine = await createOrderLineItems(salesforceOrderId,pricebookId,orderShippingLineItem,shop,sessionAccessToken,isShippingLineItem);
          } catch (error) {
            console.log('Error creating Salesforce Order Shipping Line Items: ', error.response ? error.response.data : error.message);
          }
        }
      } catch (error) {
        console.error('Error creating Salesforce Order: ', error.response ? error.response.data : error.message);
      }
    }
  }
};

// Function to get session from storage
async function getSession(shop) {
  try {
    const sessionId = shopify.api.session.getOfflineId(shop);  // get the session id
    //console.log('SessionId: ', sessionId);
    return await shopify.config.sessionStorage.loadSession(sessionId);
  } catch (error) {
    console.error(`Error loading session for shop ${shop}: ${error.message}`);
    throw error;
  }
}

// Function to fetch Salesforce credentials from the metaobject
async function fetchSalesforceCredentials(shop, sessionAccessToken) {
  try {
    //console.log('fetchSalesforceCredentials: =>');
    //console.log('Session shop: ', shop);
    //console.log('Session Access Token: ', sessionAccessToken);

    const client = new GraphQLClient(`https://${shop}/admin/api/2023-07/graphql.json`, {
      headers: {
        'X-Shopify-Access-Token': sessionAccessToken,
      },
    });

    const query = gql`
    query {
      metaobjects(type: "salesforce_credentials", first: 1,reverse:true, sortKey: "updated_at") {
        edges {
          node {
            id
            fields {
              key
              value
            }
          }
        }
      }
    }
  `;

    let data = await client.request(query);
    const fields = data.metaobjects.edges[0].node.fields;
    const credentials = fields.reduce((acc, field) => {
      acc[field.key] = field.value;
      return acc;
    }, {});
    //console.log('Salesforce Credentials: ', credentials);

    return credentials;
  } catch (error) {
    console.log('Error Fetching Salesforce credentials: ', error);
  }

}

// Function to get access token
async function getAccessToken(shop, sessionAccessToken) {
  try {
    const salesforce_credentials = await fetchSalesforceCredentials(shop, sessionAccessToken);
    //console.log('Salesforce Credentials data: ', salesforce_credentials.data);
    const response = await axios.post(`${salesforce_credentials.instance_url}/services/oauth2/token`, null, {
      params: {
        grant_type: 'client_credentials',
        client_id: `${salesforce_credentials.client_id}`,
        client_secret: `${salesforce_credentials.client_secret}`,
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    return {
      accessToken: response.data.access_token,
      instanceUrl: response.data.instance_url
    };

  } catch (error) {
    console.error('Error getting access token:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Function to create an Account in Salesforce
async function createAccount(accountData, shop, sessionAccessToken) {
  try {
    const { accessToken, instanceUrl } = await getAccessToken(shop, sessionAccessToken);
    console.log('Access Token in CUSTOMERS_CREATE: ', accessToken);
    const response = await axios.post(`${instanceUrl}/services/data/v60.0/sobjects/Account`, accountData, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    //console.log('Account created successfully:', response.data);
    return response.data.id;
  } catch (error) {
    console.error('Error creating account:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Function to get PersonAccount RecordTypeId
async function getPersonAccountRecordTypeId(shop, sessionAccessToken) {
  try {
    const { accessToken, instanceUrl } = await getAccessToken(shop, sessionAccessToken);
    const response = await axios.get(`${instanceUrl}/services/data/v60.0/query`, {
      params: {
        q: "SELECT Id FROM RecordType WHERE DeveloperName = 'PersonAccount' LIMIT 1"
      },
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    if (response.data.records.length > 0) {
      return response.data.records[0].Id;
    } else {
      throw new Error('No RecordTypeId found for PersonAccount');
    }
  } catch (error) {
    console.error('Error getting RecordTypeId:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Function to get Pricebook Id
async function getPricebookId(shop, sessionAccessToken) {
  try {
    const { accessToken, instanceUrl } = await getAccessToken(shop, sessionAccessToken);
    const response = await axios.get(`${instanceUrl}/services/data/v60.0/query`, {
      params: {
        q: "SELECT Id, Name, IsActive FROM Pricebook2 WHERE Name = 'Shopify Price Book' AND IsActive = true LIMIT 1"
      },
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    if (response.data.records.length > 0) {
      return response.data.records[0].Id;
    } else {
      throw new Error('No PriceBook foundfor Shopify.');
    }

  } catch (error) {
    console.log('Error getting PricebookId: ', error.response ? error.response.data : error.message)
  }
}

// Function to check whether the Customer already exist
async function checkCustomerExist(customerId, shop, sessionAccessToken) {
  try {
    const { accessToken, instanceUrl } = await getAccessToken(shop, sessionAccessToken);
    const response = await axios.get(`${instanceUrl}/services/data/v60.0/query`, {
      params: {
        q: `SELECT Id FROM Account WHERE OMSQS_Shopify_Customer_Id__c = '${customerId}' LIMIT 1`
      },
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    //console.log('Existing customer Response: ', response.data);
    if (response.data.records.length > 0) {
      return response.data.records[0].Id;
    } else {
      return 'New Customer';
    }
  } catch (error) {
    console.error('Error getting Existing Customer:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Function to create an Order
async function createOrder(orderData, shop, sessionAccessToken) {
  try {
    const { accessToken, instanceUrl } = await getAccessToken(shop, sessionAccessToken);
    const response = await axios.post(`${instanceUrl}/services/data/v60.0/sobjects/Order`, orderData, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    //console.log('Order created successfully:', response.data);
    return response.data.id;
  } catch (error) {
    console.error('Error creating Order:', error.response ? error.response.data : error.message);
    throw error;
  }
}


// Function to create Order LineItems
async function createOrderLineItems(salesforceOrderId,pricebookId,orderLineItems,shop,sessionAccessToken,isShippingLineItem) {
  try {
    console.log('In createOrderLineItems block: ');
    orderLineItems.forEach(lineitem => {
      createLineItem(salesforceOrderId,pricebookId,lineitem,shop,sessionAccessToken,isShippingLineItem);
    });
  } catch (error) {
    console.log('Error creating Order Line Items: ', error.response ? error.response.data : error.message);
  }
}

// Function to create a LineItem
async function createLineItem(salesforceOrderId,pricebookId,lineitem,shop,sessionAccessToken,isShippingLineItem) {
  let SKU;
  let requestedQuantity;
  let lineItemPrice;
  let orderType;
  if(isShippingLineItem == true) {
    SKU = lineitem.code;
    requestedQuantity = 1;
    lineItemPrice = parseFloat(lineitem.price);
    orderType = 'Delivery Charge'
  } else {
    SKU = lineitem.sku;
    requestedQuantity = parseInt(lineitem.quantity);
    lineItemPrice = parseFloat(lineitem.price);
    orderType = 'Order Product'
  }
  const productId = await getProductId(SKU, shop, sessionAccessToken);
  //console.log('ProductId: ', productId);
  const pricebookEntryId = await getPricebookEntryId(SKU,pricebookId,shop,sessionAccessToken);
  //console.log('PricebookEntryId: ', pricebookEntryId);
  const orderLineItemData = {
    OrderId: salesforceOrderId,
    Product2Id: productId,
    Quantity: requestedQuantity,
    UnitPrice: lineItemPrice,
    PricebookEntryId: pricebookEntryId,
    Type: orderType,
    TotalLineAmount: lineItemPrice,
    OMSQS_Shopify_Line_Item_Id__c:lineitem.id
  };
  //console.log('orderLineItemData: ', orderLineItemData);
  //console.log('price_set: ', lineitem.price_set);
  //console.log('total_discount_set: ', lineitem.total_discount_set);
  //console.log('tax_lines: ', lineitem.tax_lines);
  console.log('discount_allocations: ', lineitem.discount_allocations);
  try {
    const { accessToken, instanceUrl } = await getAccessToken(shop, sessionAccessToken);
    const response = await axios.post(`${instanceUrl}/services/data/v60.0/sobjects/OrderItem`, orderLineItemData, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    console.log('Order Line Item created successfully:', response.data);
    const orderLineItemId = response.data.id;
    //console.log('OrdeLineItemId: ',orderLineItemId);
    if(lineitem.tax_lines.length > 0) {
      const taxLines = lineitem.tax_lines;
      const taxLineName = `${lineitem.title} Tax`
      console.log('tax_lines: ', lineitem.tax_lines);
      const createTaxLineItem = createOrderTaxLineItem(orderLineItemId,taxLines,taxLineName,SKU,shop,sessionAccessToken);
    }
    const lineitemDiscount = parseFloat(lineitem.total_discount);
    if(lineitemDiscount > 0) {
      const discountName = `${lineitem.title} Adjustment`
      const createTaxLineItem = createOrderAdjustmentLineItem(orderLineItemId,lineitemDiscount,discountName,SKU,shop,sessionAccessToken);
    }
  } catch (error) {
    console.error('Error creating Order Line Item:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Function to get ProductId
async function getProductId(SKU, shop, sessionAccessToken) {
  try {
    const { accessToken, instanceUrl } = await getAccessToken(shop, sessionAccessToken);
    const response = await axios.get(`${instanceUrl}/services/data/v60.0/query`, {
      params: {
        q: `SELECT Id, Name, StockKeepingUnit FROM Product2 WHERE StockKeepingUnit = '${SKU}' LIMIT 1`
      },
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    if (response.data.records.length > 0) {
      return response.data.records[0].Id;
    } else {
      throw new Error(`No Product found for the SKU: ${SKU}`);
    }

  } catch (error) {
    console.log('Error getting ProductId: ', error.response ? error.response.data : error.message)
  }
}

// Function to get ProductId
async function getPricebookEntryId(SKU,pricebookId,shop, sessionAccessToken) {
  try {
    const { accessToken, instanceUrl } = await getAccessToken(shop, sessionAccessToken);
    const response = await axios.get(`${instanceUrl}/services/data/v60.0/query`, {
      params: {
        q: `SELECT Id, Name, ProductCode, Pricebook2Id, IsActive 
        FROM PricebookEntry 
        WHERE ProductCode = '${SKU}' 
        AND Pricebook2Id = '${pricebookId}' 
        AND IsActive = true LIMIT 1`
      },
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    if (response.data.records.length > 0) {
      return response.data.records[0].Id;
    } else {
      throw new Error(`No Pricebook Entry found for the SKU: ${SKU}`);
    }

  } catch (error) {
    console.log('Error getting PricebookEntryId: ', error.response ? error.response.data : error.message)
  }
}

async function createOrderTaxLineItem(orderLineItemId,taxLines,taxLineName,SKU,shop,sessionAccessToken) {
  try {
    const orderTaxLineItemData = {
      Amount: parseFloat(taxLines[0].price),
      Name: taxLineName,
      OrderItemId: orderLineItemId,
      Rate: parseFloat(taxLines[0].rate),
      TaxEffectiveDate: new Date(),
      Type: 'Actual'
    };
    
    const { accessToken, instanceUrl } = await getAccessToken(shop, sessionAccessToken);
    const response = await axios.post(`${instanceUrl}/services/data/v60.0/sobjects/OrderItemTaxLineItem`, orderTaxLineItemData, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    console.log('Order Tax Line Item created successfully:', response.data);
  } catch (error) {
    console.log(`Error creating Order Tax Line Item for SKU: ${SKU}`,error.response ? error.response.data : error.message);
  }
}

async function createOrderAdjustmentLineItem(orderLineItemId,lineitemDiscount,discountName,SKU,shop,sessionAccessToken) {
  try {
    const orderAdjustmentLineItemData = {
      Amount: -parseFloat(lineitemDiscount),
      Name: discountName,
      OrderItemId: orderLineItemId
    };
    
    const { accessToken, instanceUrl } = await getAccessToken(shop, sessionAccessToken);
    const response = await axios.post(`${instanceUrl}/services/data/v60.0/sobjects/OrderItemAdjustmentLineItem`, orderAdjustmentLineItemData, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    console.log('Order Adjustment Line Item created successfully:', response.data);
  } catch (error) {
    console.log(`Error creating Order Adjustment Line Item for SKU: ${SKU}`,error.response ? error.response.data : error.message);
  }
}