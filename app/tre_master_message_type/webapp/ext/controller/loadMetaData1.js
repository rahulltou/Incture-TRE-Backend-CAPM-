sap.ui.define(
    ["sap/m/MessageToast"],
    function (MessageToast) {
        "use strict";

        return {
            /**
             * Generated event handler.
             *
             * @param oContext the context of the page on which the event was fired. `undefined` for list report page.
             * @param aSelectedContexts the selected contexts of the table rows.
             */
            loadMetaData1: function (oContext, aSelectedContexts) {

                debugger;

                if (!aSelectedContexts || aSelectedContexts.length === 0) {
                    sap.m.MessageToast.show("Please select a Message Type");
                    return;
                }

                // const oRow = aContexts[0].getObject();
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

                // native action invocation
                this.editFlow.invokeAction(
                    "tRE_Admin.loadMetadata",           // Action name (NOT path)
                    {
                        contexts: aSelectedContexts, // Pass selected row context
                        parameters: {
                            messageType: oRow.messageType,
                            systemAlias: oRow.systemAlias
                        },
                        skipParameterDialog: true
                    }
                ).then(function () {
                    MessageToast.show(
                        `Metadata loaded for ${oRow.messageType} (${oRow.systemAlias})`
                    );
                }).catch(function (oError) {
                    console.error(oError);
                    sap.m.MessageToast.show("Error while loading metadata");
                });
            }

        };
    }
);
