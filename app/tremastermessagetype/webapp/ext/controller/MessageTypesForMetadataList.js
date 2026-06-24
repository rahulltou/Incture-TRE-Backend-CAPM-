sap.ui.define(
    ["sap/m/MessageToast"],
    function (MessageToast) {
        "use strict";

        return {
            /**
             * Load Metadata action handler
             * Gets selected row ID and passes to backend action
             */
            loadMetadata: function (oContext, aSelectedContexts) {

                aSelectedContexts =
                    this.extensionAPI.getSelectedContexts();

                if (!aSelectedContexts || aSelectedContexts.length === 0) {
                    MessageToast.show("Please select a Message Type");
                    return;
                }

                // Get selected row
                const oRow = aSelectedContexts[0].getObject();
                const sID = oRow.ID;

                if (!sID) {
                    MessageToast.show("ID not found in selected row");
                    return;
                }

                // Get OData model
                const oModel = this.base.getView().getModel();

                // Call action with ID parameter
                oModel.callFunction(
                    "/MessageTypesForMetadata/loadMetadata",
                    {
                        method: "POST",
                        urlParameters: {
                            ID: sID
                        },
                        success: function (oResponse) {
                            MessageToast.show("Metadata loaded successfully");
                            oModel.refresh(true);
                        },
                        error: function (oError) {
                            console.error(oError);
                            MessageToast.show("Error loading metadata");
                        }
                    }
                );
            }
        };
    }
);
