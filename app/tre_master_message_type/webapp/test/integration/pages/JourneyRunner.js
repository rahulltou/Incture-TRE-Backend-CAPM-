sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"nstremastermessage/tremastermessagetype/test/integration/pages/MessageTypesForMetadataList",
	"nstremastermessage/tremastermessagetype/test/integration/pages/MessageTypesForMetadataObjectPage"
], function (JourneyRunner, MessageTypesForMetadataList, MessageTypesForMetadataObjectPage) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('nstremastermessage/tremastermessagetype') + '/test/flp.html#app-preview',
        pages: {
			onTheMessageTypesForMetadataList: MessageTypesForMetadataList,
			onTheMessageTypesForMetadataObjectPage: MessageTypesForMetadataObjectPage
        },
        async: true
    });

    return runner;
});

