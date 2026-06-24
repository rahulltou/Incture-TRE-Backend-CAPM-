sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"com/inc/tremasterinbidocerrcodes/test/integration/pages/ErrorCodesList",
	"com/inc/tremasterinbidocerrcodes/test/integration/pages/ErrorCodesObjectPage"
], function (JourneyRunner, ErrorCodesList, ErrorCodesObjectPage) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('com/inc/tremasterinbidocerrcodes') + '/test/flpSandbox.html#cominctremasterinbidocerrcodes-tile',
        pages: {
			onTheErrorCodesList: ErrorCodesList,
			onTheErrorCodesObjectPage: ErrorCodesObjectPage
        },
        async: true
    });

    return runner;
});

