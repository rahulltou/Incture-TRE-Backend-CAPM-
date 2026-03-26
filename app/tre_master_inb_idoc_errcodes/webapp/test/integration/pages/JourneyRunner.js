sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"nstremasterinbidocerrcodes/tremasterinbidocerrcodes/test/integration/pages/ErrorCodesList",
	"nstremasterinbidocerrcodes/tremasterinbidocerrcodes/test/integration/pages/ErrorCodesObjectPage"
], function (JourneyRunner, ErrorCodesList, ErrorCodesObjectPage) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('nstremasterinbidocerrcodes/tremasterinbidocerrcodes') + '/test/flp.html#app-preview',
        pages: {
			onTheErrorCodesList: ErrorCodesList,
			onTheErrorCodesObjectPage: ErrorCodesObjectPage
        },
        async: true
    });

    return runner;
});

