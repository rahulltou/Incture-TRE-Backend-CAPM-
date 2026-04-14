// sap.ui.define([
//     "sap/m/MessageToast"
// ], function(MessageToast) {
//     'use strict';

//     return {
//         /**
//         * Generated event handler.
//         *
//         * @param oContext the context of the page on which the event was fired. `undefined` for list report page.
//         * @param aSelectedContexts the selected contexts of the table rows.
//         */
//         loadMetaData: function(oContext, aSelectedContexts) {
//             MessageToast.show("Custom handler invoked.");
//         }
//     };
// });

sap.ui.define(
  ["sap/m/MessageToast"],
  function (MessageToast) {
    "use strict";

    return {
      /**
       * Custom action handler: Load Metadata
       *
       * @param {object} oContext - page context (unused for List Report)
       * @param {object[]} aSelectedContexts - selected table row contexts
       */
      loadMetaData: function (oContext, aSelectedContexts) {

        debugger;

        aSelectedContexts =
          this.extensionAPI.getSelectedContexts();

        if (!aSelectedContexts || aSelectedContexts.length === 0) {
          MessageToast.show("Please select a Message Type");
          return;
        }

        // Fiori Elements passes selected row contexts
        const oRow = aSelectedContexts[0].getObject();

        // Basic safety checks (optional but recommended)
        if (!oRow.active) {
          MessageToast.show("Inactive Message Type cannot be loaded");
          return;
        }

        if (oRow.metadataLoaded) {
          MessageToast.show("Metadata is already loaded");
          return;
        }

        const oModel = this.base.getView().getModel();

        oModel.callFunction(
          "/loadMetadata",
          {
            method: "POST",
            urlParameters: {
              messageType: oRow.messageType,
              systemAlias: oRow.systemAlias
            },
            success: function (oResponse) {
              MessageToast.show(
                `Metadata loaded for ${oResponse.messageType} (${oResponse.systemAlias})`
              );

              // Refresh table data so metadataLoaded / lastLoadedAt update
              oModel.refresh(true);
            },
            error: function (oError) {
              MessageToast.show("Error while loading metadata");
              console.error(oError);
            }
          }
        );
      }
    };
  }
);

